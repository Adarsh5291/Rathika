
const express = require("express");

const wrapAsync = require("../middleware/wrapAsync");
const isAdmin = require("../middleware/isAdmin");
const upload = require("../middleware/upload");

const { cloudinary } = require("../config/cloudinary");

const {
    csrfSynchronisedProtection
} = require("../middleware/csrf");

const {
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
} = require("../controllers/adminController");

const router = express.Router();


// =====================================================
// UPLOAD CSRF VALIDATION
// =====================================================

const validateUploadCsrf = (req, res, next) => {
    csrfSynchronisedProtection(req, res, async (error) => {

        // Remove uploaded image if CSRF validation fails.
        if (error && req.file?.filename) {
            try {
                await cloudinary.uploader.destroy(req.file.filename);
            } catch (cleanupError) {
                console.error(
                    "Failed to clean up rejected upload:",
                    cleanupError
                );
            }
        }

        next(error);
    });
};


// =====================================================
// ADMIN ACCESS
// =====================================================

router.use(wrapAsync(isAdmin));


// =====================================================
// ADMIN DASHBOARD
// =====================================================

router.get(
    "/dashboard",
    wrapAsync(showAdminDashboard)
);


// =====================================================
// BIKE MANAGEMENT
// =====================================================

router.get(
    "/bikes",
    wrapAsync(showAllBikes)
);

router.get(
    "/bikes/new",
    showAddBikeForm
);

router.post(
    "/bikes",
    upload.single("image"),
    validateUploadCsrf,
    wrapAsync(addBike)
);

router.get(
    "/bikes/:id/edit",
    wrapAsync(showEditBikeForm)
);

router.post(
    "/bikes/:id/edit",
    upload.single("image"),
    validateUploadCsrf,
    wrapAsync(updateBike)
);

router.post(
    "/bikes/:id/delete",
    wrapAsync(deleteBike)
);


// =====================================================
// PHYSICAL BIKE UNIT MANAGEMENT
// =====================================================

router.get(
    "/bikes/:bikeId/units",
    wrapAsync(showBikeUnits)
);

router.post(
    "/bikes/:bikeId/units",
    wrapAsync(addBikeUnit)
);

router.post(
    "/units/:unitId/status",
    wrapAsync(updateBikeUnitStatus)
);

router.post(
    "/units/:unitId/delete",
    wrapAsync(deleteBikeUnit)
);


// =====================================================
// BOOKING MANAGEMENT
// =====================================================

router.get(
    "/bookings",
    wrapAsync(showAllBookings)
);

router.post(
    "/bookings/:bookingId/status",
    wrapAsync(updateBookingStatus)
);


// =====================================================
// USER MANAGEMENT
// =====================================================

router.get(
    "/users",
    wrapAsync(showAllUsers)
);

router.post(
    "/users/:userId/role",
    wrapAsync(updateUserRole)
);


module.exports = router;
