const express = require("express");
const wrapAsync = require("../middleware/wrapAsync");
const isLoggedIn = require("../middleware/auth");
const { showBookingForm, createBooking, cancelBooking, showPaymentPage, createPaymentOrder, verifyPayment } = require("../controllers/bookingController");

const router = express.Router();

router.get("/new/:bikeId", isLoggedIn, wrapAsync(showBookingForm));

router.post("/", isLoggedIn, wrapAsync(createBooking));
router.post("/:bookingId/cancel", isLoggedIn, wrapAsync(cancelBooking));

router.post("/:bookingId/create-order", isLoggedIn, wrapAsync(createPaymentOrder));
router.post("/:bookingId/verify-payment", isLoggedIn, wrapAsync(verifyPayment));

router.get("/:bookingId/payment", isLoggedIn, wrapAsync(showPaymentPage));

module.exports = router;