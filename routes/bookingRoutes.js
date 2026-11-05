const express = require("express");
const wrapAsync = require("../middleware/wrapAsync");
const isLoggedIn = require("../middleware/auth");
const { showBookingForm, createBooking } = require("../controllers/bookingController");

//const { showBookingForm } = require("../controllers/bookingController");

const router = express.Router();

router.get("/new/:bikeId", isLoggedIn, wrapAsync(showBookingForm));
router.post("/", isLoggedIn, wrapAsync(createBooking));

module.exports = router;