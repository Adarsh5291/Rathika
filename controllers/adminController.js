
const User = require("../models/User");
const Bike = require("../models/Bike");
const BikeUnit = require("../models/BikeUnit");
const Booking = require("../models/Booking");
const mongoose = require("mongoose");

const { cloudinary } = require("../config/cloudinary");


// =====================================================
// HELPER FUNCTIONS
// =====================================================

const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};


const removeCloudinaryImage = async (publicId) => {
    if (!publicId) return;

    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error("Cloudinary image deletion failed:", error);
    }
};


const cleanupUploadedImage = async (req) => {
    if (req.file && req.file.filename) {
        await removeCloudinaryImage(req.file.filename);
    }
};


const validateBikeInput = (data) => {
    const {
        name,
        brand,
        type,
        pricePerDay,
        description
    } = data;

    if (
        !name?.trim() ||
        !brand?.trim() ||
        !type?.trim() ||
        pricePerDay === undefined ||
        pricePerDay === "" ||
        !description?.trim()
    ) {
        return "Please fill all required fields";
    }

    if (
        !Number.isFinite(Number(pricePerDay)) ||
        Number(pricePerDay) <= 0
    ) {
        return "Enter a valid daily price";
    }

    return null;
};


// =====================================================
// ADMIN DASHBOARD
// =====================================================

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


// =====================================================
// BIKE MANAGEMENT
// =====================================================

// Show all bikes

const showAllBikes = async (req, res) => {
    const bikes = await Bike.find().sort({ createdAt: -1 });

    res.render("admin/bikes", { bikes });
};


// Show add bike form

const showAddBikeForm = (req, res) => {
    res.render("admin/addBike");
};


// Add a new bike

const addBike = async (req, res) => {
    const {
        name,
        brand,
        type,
        pricePerDay,
        description,
        engine,
        mileage,
        transmission
    } = req.body;

    const validationError = validateBikeInput(req.body);

    if (validationError) {
        await cleanupUploadedImage(req);
        return res.status(400).send(validationError);
    }

    try {
        await Bike.create({
            name: name.trim(),
            brand: brand.trim(),
            type,
            pricePerDay: Number(pricePerDay),
            description: description.trim(),

            specifications: {
                engine,
                mileage,
                transmission
            },

            image: req.file ? req.file.path : "",
            imagePublicId: req.file ? req.file.filename : ""
        });

    } catch (error) {
        await cleanupUploadedImage(req);
        throw error;
    }

    res.redirect("/admin/bikes");
};


// Show edit bike form

const showEditBikeForm = async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
        return res.status(400).send("Invalid bike ID");
    }

    const bike = await Bike.findById(req.params.id);

    if (!bike) {
        return res.status(404).send("Bike not found");
    }

    res.render("admin/editBike", { bike });
};


// Update existing bike

const updateBike = async (req, res) => {
    const validationError = validateBikeInput(req.body);

    if (validationError) {
        await cleanupUploadedImage(req);
        return res.status(400).send(validationError);
    }

    if (!isValidObjectId(req.params.id)) {
        await cleanupUploadedImage(req);
        return res.status(400).send("Invalid bike ID");
    }

    const bike = await Bike.findById(req.params.id);

    if (!bike) {
        await cleanupUploadedImage(req);
        return res.status(404).send("Bike not found");
    }

    const oldImagePublicId = bike.imagePublicId;

    const {
        name,
        brand,
        type,
        pricePerDay,
        description,
        engine,
        mileage,
        transmission
    } = req.body;

    // Update bike details

    bike.name = name.trim();
    bike.brand = brand.trim();
    bike.type = type;
    bike.pricePerDay = Number(pricePerDay);
    bike.description = description.trim();

    bike.specifications = {
        engine,
        mileage,
        transmission
    };

    // Replace image only if a new one was uploaded

    if (req.file) {
        bike.image = req.file.path;
        bike.imagePublicId = req.file.filename;
    }

    try {
        await bike.save();

    } catch (error) {
        await cleanupUploadedImage(req);
        throw error;
    }

    // Delete old image only after successful database update

    if (req.file && oldImagePublicId) {
        await removeCloudinaryImage(oldImagePublicId);
    }

    res.redirect("/admin/bikes");
};


// Delete bike

const deleteBike = async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
        return res.status(400).send("Invalid bike ID");
    }

    const bike = await Bike.findById(req.params.id);

    if (!bike) {
        return res.status(404).send("Bike not found");
    }

    const hasUnits = await BikeUnit.exists({
        bike: bike._id
    });

    if (hasUnits) {
        return res.status(400).send(
            "Cannot delete this bike while physical units are associated with it"
        );
    }

    const imagePublicId = bike.imagePublicId;

    await bike.deleteOne();

    // Remove associated Cloudinary image

    if (imagePublicId) {
        await removeCloudinaryImage(imagePublicId);
    }

    res.redirect("/admin/bikes");
};


// =====================================================
// PHYSICAL BIKE UNIT MANAGEMENT
// =====================================================

// Show units belonging to a bike

const showBikeUnits = async (req, res) => {
    if (!isValidObjectId(req.params.bikeId)) {
        return res.status(400).send("Invalid bike ID");
    }

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


// Add a physical bike unit

const addBikeUnit = async (req, res) => {
    const { registrationNumber } = req.body;

    if (!isValidObjectId(req.params.bikeId)) {
        return res.status(400).send("Invalid bike ID");
    }

    if (!registrationNumber || !registrationNumber.trim()) {
        return res.status(400).send("Registration number is required");
    }

    const bike = await Bike.findById(req.params.bikeId);

    if (!bike) {
        return res.status(404).send("Bike not found");
    }

    await BikeUnit.create({
        bike: bike._id,
        registrationNumber: registrationNumber.trim()
    });

    res.redirect(`/admin/bikes/${bike._id}/units`);
};


// Update physical bike unit status

const updateBikeUnitStatus = async (req, res) => {
    const { status } = req.body;

    const allowedStatuses = [
        "Available",
        "Maintenance",
        "Inactive"
    ];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).send("Invalid bike unit status");
    }

    if (!isValidObjectId(req.params.unitId)) {
        return res.status(400).send("Invalid bike unit ID");
    }

    const session = await mongoose.startSession();

    let bikeId;

    try {
        await session.withTransaction(async () => {
            const unit = await BikeUnit.findById(req.params.unitId)
                .session(session);

            if (!unit) {
                const error = new Error("Bike unit not found");
                error.statusCode = 404;
                throw error;
            }

            bikeId = unit.bike;

            // Coordinate with simultaneous booking transactions

            await BikeUnit.updateOne(
                { _id: unit._id },
                { $inc: { allocationVersion: 1 } },
                { session }
            );

            // A unit with active bookings cannot be disabled

            if (status !== "Available") {
                const hasActiveBookings = await Booking.exists({
                    bikeUnit: unit._id,
                    bookingStatus: {
                        $in: ["Pending", "Confirmed"]
                    }
                }).session(session);

                if (hasActiveBookings) {
                    const error = new Error(
                        "Cannot disable this bike unit because it has active bookings"
                    );

                    error.statusCode = 409;
                    throw error;
                }
            }

            await BikeUnit.updateOne(
                { _id: unit._id },
                { $set: { status } },
                {
                    session,
                    runValidators: true
                }
            );
        });

    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).send(error.message);
        }

        throw error;

    } finally {
        await session.endSession();
    }

    res.redirect(`/admin/bikes/${bikeId}/units`);
};


// Delete a physical bike unit

const deleteBikeUnit = async (req, res) => {
    if (!isValidObjectId(req.params.unitId)) {
        return res.status(400).send("Invalid bike unit ID");
    }

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


// =====================================================
// BOOKING MANAGEMENT
// =====================================================

// Show all bookings

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


// Update booking status

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

    if (!isValidObjectId(req.params.bookingId)) {
        return res.status(400).send("Invalid booking ID");
    }

    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
        return res.status(404).send("Booking not found");
    }

    // No need to update if the status is already the same

    if (booking.bookingStatus === status) {
        return res.redirect("/admin/bookings");
    }

    // Only paid bookings can be confirmed

    if (
        status === "Confirmed" &&
        booking.paymentStatus !== "Paid"
    ) {
        return res.status(400).send(
            "Cannot confirm a booking before successful payment"
        );
    }

    // Only paid and confirmed bookings can be completed

    if (
        status === "Completed" &&
        (
            booking.bookingStatus !== "Confirmed" ||
            booking.paymentStatus !== "Paid"
        )
    ) {
        return res.status(400).send(
            "Only paid and confirmed bookings can be completed"
        );
    }

    // Paid bookings cannot be cancelled until refund handling exists

    if (
        status === "Cancelled" &&
        booking.paymentStatus === "Paid"
    ) {
        return res.status(400).send(
            "This booking has been paid. Handle the refund before cancellation."
        );
    }

    // Prevent reopening cancelled or completed bookings

    if (
        status === "Pending" ||
        ["Cancelled", "Completed"].includes(booking.bookingStatus)
    ) {
        return res.status(400).send(
            "This booking status transition is not allowed"
        );
    }

    // Only Pending bookings can be cancelled without a refund

    if (
        status === "Cancelled" &&
        booking.bookingStatus !== "Pending"
    ) {
        return res.status(400).send(
            "Only pending bookings can be cancelled without a refund"
        );
    }

    // Conditional update prevents conflicting status changes

    const updatedBooking = await Booking.findOneAndUpdate(
        {
            _id: booking._id,
            bookingStatus: booking.bookingStatus,
            paymentStatus: booking.paymentStatus
        },
        {
            $set: {
                bookingStatus: status
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!updatedBooking) {
        return res.status(409).send(
            "Booking was updated by another request. Please try again."
        );
    }

    res.redirect("/admin/bookings");
};


// =====================================================
// USER MANAGEMENT
// =====================================================

// Show all users

const showAllUsers = async (req, res) => {
    const users = await User.find()
        .select("-password")
        .sort({ createdAt: -1 });

    res.render("admin/users", {
        users,
        currentUserId: req.session.userId
    });
};


// Update user role

const updateUserRole = async (req, res) => {
    const { role } = req.body;

    if (!["user", "admin"].includes(role)) {
        return res.status(400).send("Invalid role");
    }

    if (!isValidObjectId(req.params.userId)) {
        return res.status(400).send("Invalid user ID");
    }

    // Prevent administrators from changing their own role

    if (req.params.userId === String(req.session.userId)) {
        return res.status(400).send(
            "You cannot change your own role"
        );
    }

    const user = await User.findByIdAndUpdate(
        req.params.userId,
        { role },
        {
            new: true,
            runValidators: true
        }
    );

    if (!user) {
        return res.status(404).send("User not found");
    }

    res.redirect("/admin/users");
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
    updateBookingStatus,

    showAllUsers,
    updateUserRole
};
