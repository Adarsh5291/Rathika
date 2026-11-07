const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        bikeUnit: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BikeUnit",
            required: true
        },

        pickupDate: {
            type: Date,
            required: true
        },

        returnDate: {
            type: Date,
            required: true,
            validate: {
                validator: function (value) {
                    return value > this.pickupDate;
                },
                message: "Return date must be after pickup date"
            }
        },

        totalAmount: {
            type: Number,
            required: true,
            min: 0
        },

        bookingStatus: {
            type: String,
            enum: ["Pending", "Confirmed", "Cancelled", "Completed"],
            default: "Pending"
        },

        paymentStatus: {
            type: String,
            enum: ["Pending", "Paid", "Failed", "Refunded"],
            default: "Pending"
        },

        paymentId: {
            type: String,
            default: ""
        },

        razorpayOrderId: {
        type: String,
        default: ""
        }
    },


    {
        timestamps: true
    }
);

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;