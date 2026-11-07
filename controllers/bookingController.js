const Bike = require("../models/Bike");
const BikeUnit = require("../models/BikeUnit");
const Booking = require("../models/Booking");
const mongoose = require("mongoose");
const crypto = require("crypto");
const razorpay = require("../config/razorpay");

const showBookingForm = async (req, res) => {
    const bike = await Bike.findById(req.params.bikeId);

    if (!bike) {
        return res.status(404).send("Bike not found");
    }

    res.render("booking", { bike });
};


const createBooking = async (req, res) => {
    const { bikeId, pickupDate, returnDate } = req.body;

    if (!bikeId || !pickupDate || !returnDate) {
        return res.status(400).send("All booking fields are required");
    }

    // Validate MongoDB ID
    if (!mongoose.Types.ObjectId.isValid(bikeId)) {
        return res.status(400).send("Invalid bike ID");
    }

    // Validate date-only input in YYYY-MM-DD format
    const parseDate = (value) => {
        if (
            typeof value !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(value)
        ) {
            return null;
        }

        const date = new Date(`${value}T00:00:00.000Z`);

        if (date.toISOString().slice(0, 10) !== value) {
            return null;
        }

        return date;
    };

    const pickup = parseDate(pickupDate);
    const returnDateTime = parseDate(returnDate);

    if (!pickup || !returnDateTime) {
        return res.status(400).send("Invalid booking dates");
    }

    // Get today's date in Indian Standard Time
    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata"
    }).format(new Date());

    if (pickupDate < today) {
        return res.status(400).send("Pickup date cannot be in the past");
    }

    if (returnDateTime <= pickup) {
        return res.status(400).send("Return date must be after pickup date");
    }

    // Find the selected bike
    const bike = await Bike.findById(bikeId);

    if (!bike) {
        return res.status(404).send("Bike not found");
    }

    if (!Number.isFinite(bike.pricePerDay) || bike.pricePerDay < 0) {
        return res.status(400).send("Invalid bike rental price");
    }

    // Calculate rental duration and total amount
    const rentalDays = Math.ceil(
        (returnDateTime - pickup) / (1000 * 60 * 60 * 24)
    );

    const totalAmount = rentalDays * bike.pricePerDay;

    // Start MongoDB transaction
    const session = await mongoose.startSession();

    let createdBookingId;

    try {
        await session.withTransaction(async () => {

            // Find physical units that can be rented
            const bikeUnits = await BikeUnit.find({
                bike: bikeId,
                status: "Available"
            }).session(session);

            let availableUnit = null;

            for (const unit of bikeUnits) {

                // Atomically update this unit.
                // Concurrent transactions attempting to allocate
                // the same unit will conflict.
                const lockResult = await BikeUnit.updateOne(
                    {
                        _id: unit._id,
                        status: "Available"
                    },
                    {
                        $inc: { allocationVersion: 1 }
                    },
                    { session }
                );

                if (lockResult.modifiedCount !== 1) {
                    continue;
                }

                // Check for overlapping active bookings
                const conflictingBooking = await Booking.findOne({
                    bikeUnit: unit._id,
                    bookingStatus: {
                        $in: ["Pending", "Confirmed"]
                    },
                    pickupDate: { $lt: returnDateTime },
                    returnDate: { $gt: pickup }
                }).session(session);

                if (!conflictingBooking) {
                    availableUnit = unit;
                    break;
                }
            }

            if (!availableUnit) {
                const error = new Error(
                    "Sorry, this bike is not available for the selected dates"
                );

                error.statusCode = 409;
                throw error;
            }

            // Create booking inside the same transaction
            const newBooking = new Booking({
                user: req.session.userId,
                bikeUnit: availableUnit._id,
                pickupDate: pickup,
                returnDate: returnDateTime,
                totalAmount,
                bookingStatus: "Pending",
                paymentStatus: "Pending"
            });

            await newBooking.save({ session });

            createdBookingId = newBooking._id;
        });

    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).send(error.message);
        }

        throw error;

    } finally {
        await session.endSession();
    }

    res.redirect(`/bookings/${createdBookingId}/payment`);
};



const cancelBooking = async (req, res) => {
    const { bookingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).send("Invalid booking ID");
    }

    const booking = await Booking.findOne({
        _id: bookingId,
        user: req.session.userId
    });

    if (!booking) {
        return res.status(404).send("Booking not found");
    }

    if (!["Pending", "Confirmed"].includes(booking.bookingStatus)) {
        return res.status(400).send("This booking cannot be cancelled");
    }

    // Paid bookings require refund handling before cancellation
    if (booking.paymentStatus === "Paid") {
        return res.status(400).send(
            "This booking has already been paid. Refund handling is required before cancellation."
        );
    }

    // Update only if the booking is still eligible for cancellation
    const cancelledBooking = await Booking.findOneAndUpdate(
        {
            _id: booking._id,
            user: req.session.userId,
            bookingStatus: { $in: ["Pending", "Confirmed"] },
            paymentStatus: { $ne: "Paid" }
        },
        {
            $set: {
                bookingStatus: "Cancelled"
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!cancelledBooking) {
        return res.status(409).send(
            "Booking could not be cancelled. Please refresh and try again."
        );
    }

    res.redirect("/dashboard");
};




const createPaymentOrder = async (req, res) => {
    const { bookingId } = req.params;

    const booking = await Booking.findOne({
        _id: bookingId,
        user: req.session.userId
    });

    if (!booking) {
        return res.status(404).send("Booking not found");
    }

    if (
        booking.bookingStatus !== "Pending" ||
        booking.paymentStatus !== "Pending"
    ) {
        return res.status(400).send("Booking is not eligible for payment");
    }

    // Check the assigned physical bike unit.
    const bikeUnit = await BikeUnit.findById(booking.bikeUnit);

    if (!bikeUnit || bikeUnit.status !== "Available") {
        return res.status(409).send(
            "This bike unit is currently unavailable."
        );
    }

    // Check whether another active booking overlaps these dates.
    const conflictingBooking = await Booking.exists({
        _id: { $ne: booking._id },
        bikeUnit: booking.bikeUnit,
        bookingStatus: { $in: ["Pending", "Confirmed"] },
        pickupDate: { $lt: booking.returnDate },
        returnDate: { $gt: booking.pickupDate }
    });

    if (conflictingBooking) {
        return res.status(409).send(
            "This bike is no longer available for your selected dates."
        );
    }

    // Reuse the existing Razorpay order if one was already created.
    if (booking.razorpayOrderId) {
        const existingOrder = await razorpay.orders.fetch(
            booking.razorpayOrderId
        );

        if (
            existingOrder.receipt !== booking._id.toString() ||
            existingOrder.amount !== Math.round(booking.totalAmount * 100) ||
            existingOrder.currency !== "INR"
        ) {
            return res.status(400).send("Existing payment order is invalid");
        }

        return res.json({
            orderId: existingOrder.id,
            amount: existingOrder.amount,
            currency: existingOrder.currency,
            keyId: process.env.RAZORPAY_KEY_ID
        });
    }

    const amountInPaise = Math.round(booking.totalAmount * 100);

    const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: booking._id.toString()
    });

    booking.razorpayOrderId = order.id;
    await booking.save();

    res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
    });
};

const verifyPayment = async (req, res) => {
    const { bookingId } = req.params;

    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
    } = req.body;

    // Validate payment response
    if (
        typeof razorpay_order_id !== "string" ||
        typeof razorpay_payment_id !== "string" ||
        typeof razorpay_signature !== "string" ||
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !/^[a-fA-F0-9]{64}$/.test(razorpay_signature)
    ) {
        return res.status(400).send("Invalid payment response");
    }

    const booking = await Booking.findOne({
        _id: bookingId,
        user: req.session.userId
    });

    if (!booking) {
        return res.status(404).send("Booking not found");
    }

    if (
        booking.bookingStatus !== "Pending" ||
        booking.paymentStatus !== "Pending"
    ) {
        return res.status(400).send("Booking is not eligible for payment");
    }

    // Verify that this order belongs to this booking
    if (booking.razorpayOrderId !== razorpay_order_id) {
        return res.status(400).send("Payment order does not belong to this booking");
    }

    // Fetch the order directly from Razorpay
    const order = await razorpay.orders.fetch(razorpay_order_id);

    if (
        order.receipt !== booking._id.toString() ||
        order.amount !== Math.round(booking.totalAmount * 100) ||
        order.currency !== "INR"
    ) {
        return res.status(400).send("Payment order does not match booking");
    }

    // Generate expected signature
    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const receivedBuffer = Buffer.from(razorpay_signature, "hex");

    if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
        return res.status(400).send("Invalid payment signature");
    }

    // Verify payment directly with Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (
        payment.order_id !== razorpay_order_id ||
        payment.amount !== order.amount ||
        payment.currency !== "INR" ||
        payment.status !== "captured"
    ) {
        return res.status(400).send("Payment has not been successfully captured");
    }

    // Update only if the booking is still pending
    const updatedBooking = await Booking.findOneAndUpdate(
        {
            _id: booking._id,
            user: req.session.userId,
            razorpayOrderId: razorpay_order_id,
            bookingStatus: "Pending",
            paymentStatus: "Pending"
        },
        {
            $set: {
                paymentStatus: "Paid",
                paymentId: razorpay_payment_id,
                bookingStatus: "Confirmed"
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!updatedBooking) {
        return res.status(409).send("Booking has already been processed");
    }

    res.json({
        message: "Payment verified and booking confirmed",
        bookingId: updatedBooking._id
    });
};


const showPaymentPage = async (req, res) => {
    const booking = await Booking.findOne({
        _id: req.params.bookingId,
        user: req.session.userId
    }).populate({
        path: "bikeUnit",
        populate: {
            path: "bike"
        }
    });

    if (!booking) {
        return res.status(404).send("Booking not found");
    }

    if (
        booking.bookingStatus !== "Pending" ||
        booking.paymentStatus !== "Pending"
    ) {
        return res.status(400).send("This booking is not awaiting payment");
    }

    if (!booking.bikeUnit || !booking.bikeUnit.bike) {
        return res.status(404).send("Bike details not found");
    }

    // Check whether the assigned physical bike unit is available.
    if (booking.bikeUnit.status !== "Available") {
        return res.status(409).send(
            "This bike unit is currently unavailable. Please contact support."
        );
    }

    // Check for another active booking overlapping these dates.
    const conflictingBooking = await Booking.exists({
        _id: { $ne: booking._id },
        bikeUnit: booking.bikeUnit._id,
        bookingStatus: { $in: ["Pending", "Confirmed"] },
        pickupDate: { $lt: booking.returnDate },
        returnDate: { $gt: booking.pickupDate }
    });

    if (conflictingBooking) {
        return res.status(409).send(
            "This bike is no longer available for your selected dates."
        );
    }

    res.render("payment", {
        booking,
        bike: booking.bikeUnit.bike
    });
};


module.exports = {
    showBookingForm,
    createBooking,
    cancelBooking,
    createPaymentOrder,
    verifyPayment,
    showPaymentPage
};