const Bike = require("../models/Bike");
const BikeUnit = require("../models/BikeUnit");
const Booking = require("../models/Booking");
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

    const bike = await Bike.findById(bikeId);

    if (!bike) {
        return res.status(404).send("Bike not found");
    }

    const pickup = new Date(pickupDate);
    const returnDateTime = new Date(returnDate);

    if (Number.isNaN(pickup.getTime()) || Number.isNaN(returnDateTime.getTime())) {
        return res.status(400).send("Invalid booking dates");
    }

    // Get today's date in Indian Standard Time
    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata"
    }).format(new Date());

    // Prevent bookings for past dates
    if (pickupDate < today) {
        return res.status(400).send("Pickup date cannot be in the past");
    }

    if (returnDateTime <= pickup) {
        return res.status(400).send("Return date must be after pickup date");
    }

    // Find physical units belonging to this bike
    const bikeUnits = await BikeUnit.find({
        bike: bikeId,
        status: "Available"
    });

    // Find a unit that has no overlapping booking
    let availableUnit = null;

    for (const unit of bikeUnits) {
        const conflictingBooking = await Booking.findOne({
           bikeUnit: unit._id,
            bookingStatus: { $in: ["Pending", "Confirmed"] },
            pickupDate: { $lt: returnDateTime },
            returnDate: { $gt: pickup }
        });

        if (!conflictingBooking) {
            availableUnit = unit;
            break;
        }
    }

    if (!availableUnit) {
        return res.status(409).send("Sorry, this bike is not available for the selected dates");
    }

    // Calculate rental duration
    const rentalDays = Math.ceil(
        (returnDateTime - pickup) / (1000 * 60 * 60 * 24)
    );

    // Calculate total booking amount
    const totalAmount = rentalDays * bike.pricePerDay;

    // Create and save booking in MongoDB
    const newBooking = await Booking.create({
        user: req.session.userId,
        bikeUnit: availableUnit._id,
        pickupDate: pickup,
        returnDate: returnDateTime,
        totalAmount: totalAmount,
        bookingStatus: "Pending",
        paymentStatus: "Pending"
    });

    res.redirect(`/bookings/${newBooking._id}/payment`);

};

const cancelBooking = async (req, res) => {
    const { bookingId } = req.params;

    // Find a booking belonging to the logged-in user
    const booking = await Booking.findOne({
        _id: bookingId,
        user: req.session.userId
    });

    if (!booking) {
        return res.status(404).send("Booking not found");
    }

    // Only pending or confirmed bookings can be cancelled
    if (!["Pending", "Confirmed"].includes(booking.bookingStatus)) {
        return res.status(400).send("This booking cannot be cancelled");
    }

    // Update booking status
    booking.bookingStatus = "Cancelled";

    await booking.save();

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

    if (booking.bookingStatus !== "Pending") {
        return res.status(400).send("Booking is not eligible for payment");
    }

    if (booking.paymentStatus !== "Pending") {
        return res.status(400).send("Payment is not pending");
    }

    const amountInPaise = Math.round(booking.totalAmount * 100);

    const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: booking._id.toString()
    });

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

    if (
    typeof razorpay_order_id !== "string" ||
    typeof razorpay_payment_id !== "string" ||
    typeof razorpay_signature !== "string" ||
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature
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

    if (booking.bookingStatus !== "Pending" ||
        booking.paymentStatus !== "Pending") {
        return res.status(400).send("Booking is not eligible for payment");
    }

    const order = await razorpay.orders.fetch(razorpay_order_id);

    if (
        order.receipt !== booking._id.toString() ||
        order.amount !== Math.round(booking.totalAmount * 100) ||
        order.currency !== "INR"
    ) {
        return res.status(400).send("Payment order does not match booking");
    }

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

    const signaturesMatch =
        expectedSignature.length === razorpay_signature.length &&
        crypto.timingSafeEqual(
            Buffer.from(expectedSignature),
            Buffer.from(razorpay_signature)
        );

    if (!signaturesMatch) {
        return res.status(400).send("Invalid payment signature");
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (
        payment.order_id !== razorpay_order_id ||
        payment.amount !== order.amount ||
        payment.currency !== "INR" ||
        payment.status !== "captured"
    ) {
        return res.status(400).send("Payment has not been successfully captured");
    }

    booking.paymentStatus = "Paid";
    booking.paymentId = razorpay_payment_id;
    booking.bookingStatus = "Confirmed";

    await booking.save();

    res.json({
        message: "Payment verified and booking confirmed",
        bookingId: booking._id
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

    if (booking.bookingStatus !== "Pending" ||
        booking.paymentStatus !== "Pending") {
        return res.status(400).send("This booking is not awaiting payment");
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