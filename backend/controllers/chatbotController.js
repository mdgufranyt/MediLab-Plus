import { GoogleGenerativeAI } from "@google/generative-ai";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";

const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
const hasGeminiApiKey = Boolean(
  geminiApiKey && geminiApiKey !== "your_gemini_api_key_here"
);
const genAI = hasGeminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Free Gemini models to try in order
const FREE_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];
let currentModelIndex = 0;

// Get the next available model
const getNextModel = () => {
  const model = FREE_MODELS[currentModelIndex];
  currentModelIndex = (currentModelIndex + 1) % FREE_MODELS.length;
  return model;
};

// Try to execute with model fallback
const tryWithModelFallback = async (executeFn) => {
  let lastError;
  let attemptedModels = [];

  for (let i = 0; i < FREE_MODELS.length; i++) {
    try {
      const modelName = FREE_MODELS[i];
      attemptedModels.push(modelName);
      console.log(`Trying with model: ${modelName}`);

      const result = await executeFn(modelName);
      if (i > 0) {
        console.log(`✓ Successfully switched to model: ${modelName}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      console.log(`✗ Model ${FREE_MODELS[i]} failed:`, error.message);
      
      // If it's the last model, throw the error
      if (i === FREE_MODELS.length - 1) {
        throw new Error(
          `All models failed. Attempted: ${attemptedModels.join(", ")}. Last error: ${error.message}`
        );
      }
    }
  }

  throw lastError;
};

const specialityKeywords = [
  { speciality: "Cardiology", keywords: ["chest pain", "heart", "palpitation", "bp", "blood pressure"] },
  { speciality: "Neurology", keywords: ["headache", "migraine", "seizure", "dizziness", "numbness"] },
  { speciality: "Dermatology", keywords: ["skin", "rash", "itch", "acne", "allergy"] },
  { speciality: "Pediatrics", keywords: ["child", "baby", "infant", "kid", "pediatric"] },
  { speciality: "Orthopedics", keywords: ["bone", "joint", "back pain", "sprain", "fracture", "knee"] },
  { speciality: "ENT", keywords: ["ear", "nose", "throat", "sinus", "hearing"] },
  { speciality: "Psychiatry", keywords: ["stress", "anxiety", "depression", "sleep", "panic"] },
];

const detectSpecialityFromMessage = (text = "") => {
  const normalizedText = text.toLowerCase();

  for (const entry of specialityKeywords) {
    if (entry.keywords.some((keyword) => normalizedText.includes(keyword))) {
      return entry.speciality;
    }
  }

  return "General Practice";
};

const buildFallbackResponse = async (userMessage) => {
  const speciality = detectSpecialityFromMessage(userMessage);
  const doctors = await getDoctorsBySpeciality(speciality);

  if (doctors && doctors.length > 0) {
    const doctor = doctors[0];
    const availability = await checkDoctorAvailability(doctor.name);

    return {
      success: true,
      message: `I recommend Dr. ${doctor.name} (${doctor.speciality}) - Consultation Fee: $${doctor.fees}\nStatus: ${availability.available ? "Available" : "Fully Booked"}\nNext Step: You can book an appointment through our app.`,
      doctorInfo: availability,
    };
  }

  return {
    success: true,
    message:
      "I could not find a matching specialist right now. Please try describing your symptoms a little more clearly, or choose General Practice to start.",
    doctorInfo: null,
  };
};

// Get all doctors for context
const getAllDoctorsContext = async () => {
  try {
    const doctors = await doctorModel.find({});
    if (doctors.length === 0) {
      return "No doctors available in the system.";
    }

    let doctorsList = "Available Doctors in MediLab+:\n";
    doctors.forEach((doc) => {
      doctorsList += `- Dr. ${doc.name} (${doc.speciality}) - Fee: $${doc.fees}\n`;
    });
    return doctorsList;
  } catch (error) {
    console.log(error);
    return "Unable to fetch doctors information.";
  }
};

// Check if doctor has available slots
const checkDoctorAvailability = async (doctorName) => {
  try {
    const doctor = await doctorModel.findOne({
      name: { $regex: doctorName, $options: "i" },
    });

    if (!doctor) {
      return { available: false, message: "Doctor not found in our system." };
    }

    // Check if doctor has any available slots
    const today = new Date();
    let hasSlots = false;
    let slotsCount = 0;

    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);

      let day = checkDate.getDate();
      let month = checkDate.getMonth() + 1;
      let year = checkDate.getFullYear();

      const slotDate = day + "_" + month + "_" + year;

      // Check if doctor has slots booked for this date
      if (
        !doctor.slots_booked[slotDate] ||
        doctor.slots_booked[slotDate].length < 8 // Assuming max 16 slots per day (8:30 AM - 9 PM, 30 min slots)
      ) {
        hasSlots = true;
        slotsCount++;
      }
    }

    return {
      available: hasSlots,
      doctor: doctor,
      slotsCount: slotsCount,
      message: hasSlots
        ? `Dr. ${doctor.name} has available slots in the next ${slotsCount} days.`
        : `Dr. ${doctor.name} is fully booked. Try other doctors.`,
    };
  } catch (error) {
    console.log(error);
    return { available: false, message: "Error checking availability." };
  }
};

// Get doctors by speciality
const getDoctorsBySpeciality = async (speciality) => {
  try {
    const doctors = await doctorModel.find({
      speciality: { $regex: speciality, $options: "i" },
    });

    if (doctors.length === 0) {
      return null;
    }

    return doctors;
  } catch (error) {
    console.log(error);
    return null;
  }
};

// Extract all doctor names from text
const extractDoctorNamesFromText = (text) => {
  const doctorMatches = text.match(/Dr\.\s+(\w+\s+\w+)/g) || [];
  return [...new Set(doctorMatches.map(m => m.replace("Dr. ", "")))];
};

// Parse day/time from user message
const parseDateTimeFromMessage = (text) => {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const dayMatch = text.toLowerCase().match(new RegExp(days.join("|")));
  
  const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  
  return {
    dayName: dayMatch ? dayMatch[0] : null,
    time: timeMatch ? timeMatch[0] : null,
  };
};

// Main ChatBot API
const chatbotMessage = async (req, res) => {
  try {
    const { userMessage } = req.body;

    if (!userMessage) {
      return res.json({ success: false, message: "Please provide a message" });
    }

    if (!genAI) {
      return res.json(await buildFallbackResponse(userMessage));
    }

    // Get doctors context
    const doctorsContext = await getAllDoctorsContext();

    // Try with model fallback
    const aiResponse = await tryWithModelFallback(async (modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName });

      const systemPrompt = `You are MediLab+ AI ChatBot Assistant. You help users find the right doctor and check appointment availability.

${doctorsContext}

Your responsibilities:
1. Listen to user's symptoms/complaints
2. Suggest the most suitable doctor speciality based on their symptoms
3. Recommend specific doctors from our list
4. Check if the doctor has available appointment slots
5. Guide users on how to book appointments
6. If no suitable doctor found, suggest similar specialities or general practitioners

Important:
- Be empathetic and professional
- Provide clear recommendations
- If unsure, ask clarifying questions
- Always mention doctor's name, speciality, and consultation fee
- Never make medical diagnoses, only suggest appropriate specialities

When suggesting doctors, format your response like:
"I recommend: Dr. [Name] ([Speciality]) - Consultation Fee: $ [Fee]
Status: [Available/Fully Booked]"`;

      const chat = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: systemPrompt }],
          },
          {
            role: "model",
            parts: [
              { text: "I understand. I'm MediLab+ AI Assistant ready to help!" },
            ],
          },
        ],
      });

      // Send user message to AI
      const result = await chat.sendMessage(userMessage);
      return result.response.text();
    });

    // Extract all doctor names mentioned and check availability
    const doctorNames = extractDoctorNamesFromText(aiResponse);
    const recommendedDoctors = [];

    for (const doctorName of doctorNames) {
      const cleanDoctorName = doctorName.replace(/^Dr\.\s*/i, "").trim();
      const doctor = await doctorModel.findOne({
        name: { $regex: cleanDoctorName, $options: "i" },
      });

      if (doctor) {
        const availability = await checkDoctorAvailability(cleanDoctorName);
        recommendedDoctors.push({
          _id: doctor._id,
          name: doctor.name,
          speciality: doctor.speciality,
          fees: doctor.fees,
          experience: doctor.experience,
          available: availability.available,
          slotsCount: availability.slotsCount,
          image: doctor.image,
        });
      }
    }

    res.json({
      success: true,
      message: aiResponse,
      doctors: recommendedDoctors,
      dateTimeQuery: parseDateTimeFromMessage(userMessage),
    });
  } catch (error) {
    console.log(error);

    if (
      error?.errorDetails?.some((detail) => detail?.reason === "API_KEY_INVALID") ||
      /api key not valid|API_KEY_INVALID/i.test(error?.message || "")
    ) {
      const { userMessage } = req.body;
      return res.json(await buildFallbackResponse(userMessage || ""));
    }

    res.json({
      success: false,
      message:
        error.message || "Error processing your message. Please try again.",
    });
  }
};

// Get doctor suggestions based on symptom
const getDoctorSuggestion = async (req, res) => {
  try {
    const { symptom } = req.body;

    if (!symptom) {
      return res.json({ success: false, message: "Please provide a symptom" });
    }

    if (!genAI) {
      const speciality = detectSpecialityFromMessage(symptom);
      const doctors = await getDoctorsBySpeciality(speciality);

      return res.json({
        success: true,
        recommendation: `Based on your symptom, ${speciality} looks like the best match right now.`,
        suggestedSpeciality: speciality,
        doctors:
          doctors?.map((doc) => ({
            id: doc._id,
            name: doc.name,
            speciality: doc.speciality,
            fees: doc.fees,
            experience: doc.experience,
            available: true,
          })) || [],
      });
    }

    // Try with model fallback
    const aiResponse = await tryWithModelFallback(async (modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName });

      const prompt = `Based on the symptom "${symptom}", which doctor speciality from MediLab+ would be most suitable?

Available specialities in our system:
- General Practice
- Cardiology
- Neurology
- Dermatology
- Pediatrics
- Orthopedics
- ENT
- Psychiatry

Please respond with:
1. The most suitable speciality
2. Brief explanation (1-2 sentences)
3. Why this speciality is recommended

Keep response concise and professional.`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    // Extract speciality from response
    let speciality = null;
    const specialityMatch = aiResponse.match(
      /(Cardiology|Neurology|Dermatology|Pediatrics|Orthopedics|ENT|Psychiatry|General Practice)/i
    );
    if (specialityMatch) {
      speciality = specialityMatch[1];

      // Get doctors with this speciality
      const doctors = await getDoctorsBySpeciality(speciality);

      if (doctors && doctors.length > 0) {
        return res.json({
          success: true,
          recommendation: aiResponse,
          suggestedSpeciality: speciality,
          doctors: doctors.map((doc) => ({
            id: doc._id,
            name: doc.name,
            speciality: doc.speciality,
            fees: doc.fees,
            experience: doc.experience,
            available: true, // Simplified for now
          })),
        });
      }
    }

    res.json({
      success: true,
      recommendation: aiResponse,
      suggestedSpeciality: speciality,
      doctors: [],
    });
  } catch (error) {
    console.log(error);
    res.json({
      success: false,
      message: error.message || "Error generating suggestion.",
    });
  }
};

export { chatbotMessage, getDoctorSuggestion };
