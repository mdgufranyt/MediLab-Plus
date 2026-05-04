import React, { useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppContext } from "../context/AppContext";
import axios from "axios";
import { toast } from "react-toastify";
import { assets } from "../assets/assets";

const chatbotAnimationStyle = `
  @keyframes bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-8px);
    }
  }
  @keyframes pulse-glow {
    0%, 100% {
      opacity: 1;
      box-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
    }
    50% {
      opacity: 0.8;
      box-shadow: 0 0 30px rgba(59, 130, 246, 0.9);
    }
  }
  .chatbot-icon {
    animation: bounce 2s ease-in-out infinite;
  }
  .chatbot-button {
    animation: pulse-glow 2.5s ease-in-out infinite;
  }
`;

const Chatbot = () => {
  const { backendUrl } = useContext(AppContext);
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    {
      type: "bot",
      text: "👋 Hello! I'm MediLab+ AI Assistant. Tell me about your symptoms or health concerns, and I'll help you find the right doctor!",
      doctors: [],
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    // Add user message to chat
    const userMessage = inputValue;
    setMessages((prev) => [...prev, { type: "user", text: userMessage }]);
    setInputValue("");
    setLoading(true);

    try {
      const { data } = await axios.post(
        backendUrl + "/api/chatbot/message",
        { userMessage },
        { headers: { "Content-Type": "application/json" } }
      );

      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            type: "bot",
            text: data.message,
            doctors: data.doctors || [],
            dateTimeQuery: data.dateTimeQuery,
          },
        ]);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.log(error);
      toast.error("Error communicating with chatbot");
    }

    setLoading(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleBookDoctor = (doctorId) => {
    navigate(`/appointment/${doctorId}`);
    setIsOpen(false);
  };

  const formatBotMessage = (text) => {
    // Split by line breaks and format
    return text.split("\n").filter((line) => line.trim());
  };

  return (
    <>
      <style>{chatbotAnimationStyle}</style>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:scale-110 transition-transform z-40 chatbot-button"
          title="Open AI Assistant"
        >
          <svg
            className="w-8 h-8 chatbot-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </button>
      )}

      {/* Chat Modal */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white rounded-lg shadow-2xl flex flex-col z-50 border border-gray-200">
          {/* Header */}
          <div className="bg-primary text-white p-4 rounded-t-lg flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              🤖 MediLab+ AI
            </h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-xl hover:opacity-80"
            >
              ✕
            </button>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${
                  msg.type === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-xs ${
                    msg.type === "user"
                      ? "bg-primary text-white rounded-lg rounded-br-none px-4 py-2"
                      : "w-full"
                  }`}
                >
                  {msg.type === "user" ? (
                    <p className="text-sm break-words">{msg.text}</p>
                  ) : (
                    <>
                      {/* Bot Message with Formatting */}
                      <div className="bg-white border border-gray-300 rounded-lg rounded-bl-none p-3 text-gray-800">
                        <div className="text-sm space-y-2">
                          {formatBotMessage(msg.text).map((line, i) => (
                            <p key={i} className="break-words leading-relaxed">
                              {line}
                            </p>
                          ))}
                        </div>
                      </div>

                      {/* Doctor Recommendations */}
                      {msg.doctors && msg.doctors.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {msg.doctors.map((doctor) => {
                            const cleanName = doctor.name.replace(/^Dr\.\s*/i, "");
                            return (
                              <div
                                key={doctor._id}
                                className="bg-blue-50 border border-blue-200 rounded-lg p-3"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex-1">
                                    <h3 className="font-semibold text-sm text-blue-900">
                                      Dr. {cleanName}
                                    </h3>
                                    <p className="text-xs text-blue-700">
                                      {doctor.speciality} • ₹{doctor.fees}
                                    </p>
                                    <p className="text-xs text-blue-600 mt-1">
                                      {doctor.available
                                        ? `✅ Available (${doctor.slotsCount} days)`
                                        : "❌ Fully Booked"}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleBookDoctor(doctor._id)}
                                    className="bg-primary text-white text-xs px-3 py-1 rounded hover:bg-blue-600 transition whitespace-nowrap"
                                  >
                                    Book Now
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-300 px-4 py-2 rounded-lg text-sm rounded-bl-none">
                  <p>⏳ Analyzing...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200 p-4 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Describe your symptoms..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleSendMessage}
                disabled={loading || !inputValue.trim()}
                className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition"
              >
                Send
              </button>
            </div>
            <p className="text-xs text-gray-500">
              💡 Tip: Describe symptoms or ask "Is Dr. [name] free on [day]?"
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default Chatbot;
