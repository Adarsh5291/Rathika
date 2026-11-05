const express = require("express");
const wrapAsync = require("../middleware/wrapAsync");
const isLoggedIn = require("../middleware/auth");
const { showBookingForm, createBooking, cancelBooking } = require("../controllers/bookingController");

const router = express.Router();

router.get("/new/:bikeId", isLoggedIn, wrapAsync(showBookingForm));
router.post("/", isLoggedIn, wrapAsync(createBooking));
router.post("/:bookingId/cancel", isLoggedIn, wrapAsync(cancelBooking));
module.exports = router;