const User = require("../models/User");
const Bike = require("../models/Bike");
const BikeUnit = require("../models/BikeUnit");
const Booking = require("../models/Booking");

const showAdminDashboard = async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalBikes = await Bike.countDocuments();
    const totalBikeUnits = await BikeUnit.countDocuments();
    const totalBookings = await Booking.countDocuments();

    const pendingBookings = await Booking.countDocuments({
        bookingStatus: "Pending"
    });

    const cancelledBookings = await Booking.countDocuments({
        bookingStatus: "Cancelled"
    });

    res.render("admin/dashboard", {
        totalUsers,
        totalBikes,
        totalBikeUnits,
        totalBookings,
        pendingBookings,
        cancelledBookings
    });
};

const showAllBikes = async (req, res) => {
    const bikes = await Bike.find().sort({ createdAt: -1 });

    res.render("admin/bikes", { bikes });
};

const showAddBikeForm = (req, res) => {
    res.render("admin/addBike");
};

const addBike = async (req, res) => {
    const {
        name,
        brand,
        type,
        pricePerDay,
        description,
        engine,
        mileage,
        transmission,
        image
    } = req.body;

    if (!name || !brand || !type || !pricePerDay || !description) {
        return res.status(400).send("Please fill all required fields");
    }

    if (!Number.isFinite(Number(pricePerDay)) || Number(pricePerDay) <= 0) {
        return res.status(400).send("Enter a valid daily price");
    }

    await Bike.create({
        name,
        brand,
        type,
        pricePerDay: Number(pricePerDay),
        description,
        specifications: {
            engine,
            mileage,
            transmission
        },
        image
    });

    res.redirect("/admin/bikes");
};

const showEditBikeForm = async (req, res) => {
    const bike = await Bike.findById(req.params.id);

    if (!bike) {
        return res.status(404).send("Bike not found");
    }

    res.render("admin/editBike", { bike });
};

const updateBike = async (req, res) => {
    const {
        name,
        brand,
        type,
        pricePerDay,
        description,
        engine,
        mileage,
        transmission,
        image
    } = req.body;

    if (!name || !brand || !type || !pricePerDay || !description) {
        return res.status(400).send("Please fill all required fields");
    }

    if (!Number.isFinite(Number(pricePerDay)) || Number(pricePerDay) <= 0) {
        return res.status(400).send("Enter a valid daily price");
    }

    const bike = await Bike.findByIdAndUpdate(
        req.params.id,
        {
            name,
            brand,
            type,
            pricePerDay: Number(pricePerDay),
            description,
            specifications: { engine, mileage, transmission },
            image
        },
        { runValidators: true, new: true }
    );

    if (!bike) {
        return res.status(404).send("Bike not found");
    }

    res.redirect("/admin/bikes");
};

const showBikeUnits = async (req, res) => {
    const bike = await Bike.findById(req.params.bikeId);

    if (!bike) {
        return res.status(404).send("Bike not found");
    }

    const bikeUnits = await BikeUnit.find({
        bike: bike._id
    }).sort({ createdAt: -1 });

    res.render("admin/bikeUnits", {
        bike,
        bikeUnits
    });
};

const addBikeUnit = async (req, res) => {
    const { registrationNumber } = req.body;

    if (!registrationNumber || !registrationNumber.trim()) {
        return res.status(400).send("Registration number is required");
    }

    await BikeUnit.create({
        bike: req.params.bikeId,
        registrationNumber
    });

    res.redirect(`/admin/bikes/${req.params.bikeId}/units`);
};

const updateBikeUnitStatus = async (req, res) => {
    const { status } = req.body;

    if (!["Available", "Maintenance", "Inactive"].includes(status)) {
        return res.status(400).send("Invalid bike unit status");
    }

    const unit = await BikeUnit.findByIdAndUpdate(
        req.params.unitId,
        { status },
        { new: true, runValidators: true }
    );

    if (!unit) {
        return res.status(404).send("Bike unit not found");
    }

    res.redirect(`/admin/bikes/${unit.bike}/units`);
};

const deleteBikeUnit = async (req, res) => {
    const unit = await BikeUnit.findById(req.params.unitId);

    if (!unit) {
        return res.status(404).send("Bike unit not found");
    }

    const hasBookings = await Booking.exists({
        bikeUnit: unit._id
    });

    if (hasBookings) {
        return res.status(400).send(
            "Cannot delete a bike unit with booking history"
        );
    }

    await unit.deleteOne();

    res.redirect(`/admin/bikes/${unit.bike}/units`);
};

const deleteBike = async (req, res) => {
    const bike = await Bike.findById(req.params.id);

    if (!bike) {
        return res.status(404).send("Bike not found");
    }

    const hasUnits = await BikeUnit.exists({ bike: bike._id });

    if (hasUnits) {
        return res.status(400).send(
            "Cannot delete this bike while physical units are associated with it"
        );
    }

    await bike.deleteOne();

    res.redirect("/admin/bikes");
};

const showAllBookings = async (req, res) => {
    const bookings = await Booking.find()
        .populate("user", "name email")
        .populate({
            path: "bikeUnit",
            populate: {
                path: "bike"
            }
        })
        .sort({ createdAt: -1 });

    res.render("admin/bookings", { bookings });
};

const updateBookingStatus = async (req, res) => {
    const { status } = req.body;

    const allowedStatuses = [
        "Pending",
        "Confirmed",
        "Cancelled",
        "Completed"
    ];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).send("Invalid booking status");
    }

    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
        return res.status(404).send("Booking not found");
    }

    booking.bookingStatus = status;

    await booking.save();

    res.redirect("/admin/bookings");
};

module.exports = {
    showAdminDashboard,
    showAllBikes,
    showAddBikeForm,
    addBike,
    showEditBikeForm,
    updateBike,
    deleteBike,
    showBikeUnits,
    addBikeUnit,
    updateBikeUnitStatus,
    deleteBikeUnit,
    showAllBookings,
    updateBookingStatus
};
