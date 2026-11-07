const express = require("express");
const wrapAsync = require("../middleware/wrapAsync");
const isAdmin = require("../middleware/isAdmin");

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
    updateBookingStatus
} = require("../controllers/adminController");

const router = express.Router();

router.use(isAdmin);

router.get("/dashboard", wrapAsync(showAdminDashboard));

router.get("/bikes", wrapAsync(showAllBikes));
router.get("/bikes/new", showAddBikeForm);
router.post("/bikes", wrapAsync(addBike));

router.get("/bikes/:id/edit", wrapAsync(showEditBikeForm));
router.post("/bikes/:id/edit", wrapAsync(updateBike));
router.post("/bikes/:id/delete", wrapAsync(deleteBike));

router.get("/bikes/:bikeId/units", wrapAsync(showBikeUnits));

router.post("/bikes/:bikeId/units", wrapAsync(addBikeUnit));

router.post("/units/:unitId/status", wrapAsync(updateBikeUnitStatus));

router.post("/units/:unitId/delete", wrapAsync(deleteBikeUnit));

router.get("/bookings", wrapAsync(showAllBookings));

router.post("/bookings/:bookingId/status", wrapAsync(updateBookingStatus));

module.exports = router;