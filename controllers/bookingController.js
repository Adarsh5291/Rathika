const Bike = require("../models/Bike");
const BikeUnit = require("../models/BikeUnit");
const Booking = require("../models/Booking");

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

    res.send("Booking created successfully! Booking ID: " + newBooking._id);

};

module.exports = {
    showBookingForm,
    createBooking
};