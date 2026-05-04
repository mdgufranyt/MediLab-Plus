import Razorpay from "razorpay";
import appointmentModel from "../models/appointmentModel.js";
import userModel from "../models/userModel.js";
import crypto from "crypto";

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Razorpay Order
const createRazorpayOrder = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    const { userId } = req.body;

    // Fetch appointment details
    const appointment = await appointmentModel.findById(appointmentId);

    if (!appointment) {
      return res.json({ success: false, message: "Appointment not found" });
    }

    if (appointment.payment) {
      return res.json({
        success: false,
        message: "Payment already completed for this appointment",
      });
    }

    if (appointment.cancelled) {
      return res.json({ success: false, message: "This appointment is cancelled" });
    }

    // Fetch user details
    const user = await userModel.findById(userId);

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    // Create Razorpay Order
    const options = {
      amount: appointment.amount * 100, // Amount in paise (smallest unit)
      currency: "INR",
      receipt: `appointment_${appointmentId}`,
      payment_capture: 1, // Auto-capture payment
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      orderId: order.id,
      amount: appointment.amount,
      currency: "INR",
      userName: user.name,
      userEmail: user.email,
      userPhone: user.phone || "",
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Verify Payment
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, appointmentId } = req.body;

    // Verify signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (razorpay_signature !== expectedSign) {
      return res.json({
        success: false,
        message: "Payment verification failed - invalid signature",
      });
    }

    // Update appointment payment status
    const appointment = await appointmentModel.findByIdAndUpdate(
      appointmentId,
      { payment: true },
      { new: true }
    );

    if (!appointment) {
      return res.json({ success: false, message: "Appointment not found" });
    }

    res.json({
      success: true,
      message: "Payment verified successfully",
      appointment,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

export { createRazorpayOrder, verifyPayment };
