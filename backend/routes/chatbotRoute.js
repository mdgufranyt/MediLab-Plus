import express from "express";
import { chatbotMessage, getDoctorSuggestion } from "../controllers/chatbotController.js";

const chatbotRouter = express.Router();

chatbotRouter.post("/message", chatbotMessage);
chatbotRouter.post("/suggest-doctor", getDoctorSuggestion);

export default chatbotRouter;
