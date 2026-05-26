import React, { useState } from "react";
import "./_shared/_group.css";
import {
  ChefHat,
  CheckCircle2,
  Circle,
  QrCode,
  Utensils,
  MessageCircle,
  BarChart3,
  Shield,
  Zap,
  ArrowRight,
  Phone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Star,
  MapPin,
  Users,
  Clock,
} from "lucide-react";

const PLAN = {
  name: "Growth",
  price: "₹2,499",
  color: "#6366F1",
  colorLight: "#EEF2FF",
  features: [
    { icon: Utensils, text: "Up to 200 orders per day" },
    { icon: MapPin, text: "Up to 3 locations" },
    { icon: QrCode, text: "1 QR code per restaurant — no app needed" },
    { icon: MessageCircle, text: "WhatsApp digital bill sending" },
    { icon: BarChart3, text: "Advanced analytics & revenue reports" },
    { icon: Shield, text: "UPI, Card & Counter payment support" },
    { icon: Zap, text: "Live order dashboard for your kitchen" },
    { icon: Users, text: "Priority customer support" },
  ],
};

const STEPS = [
  {
    num: 1,
    label: "Create your account",
    desc: "Set a password to secure your TableServe account.",
    active: true,
    done: false,
  },
  {
    num: 2,
    label: "Verify your phone",
    desc: "We'll send an OTP to your registered number.",
    active: false,
    done: false,
  },
  {
    num: 3,
    label: "Build your menu",
    desc: "Add categories, items, prices, and photos.",
    active: false,
    done: false,
  },
  {
    num: 4,
    label: "Generate your QR code",
    desc: "Print and place it on your tables — you're live!",
    active: false,
    done: false,
  },
];

export function RestaurantWelcome() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [phone, setPhone] = useState("98765 43210");
  const [email, setEmail] = useState("rahul@thespicehouse.in");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  return (
    <div
      className="restaurant-app-customer"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #FFF9F4 0%, #FFF5EC 50%, #FAFAF8 100%)",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top Nav */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #F0EBE4",
          padding: "0 48px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: "#FEF0E4",
              border: "1px solid #F4821F30",
              borderRadius: 10,
              padding: "6px 8px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <ChefHat style={{ width: 22, height: 22, color: "#F4821F" }} />
          </div>
          <span
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: "#1A1A1A",
              letterSpacing: "-0.5px",
            }}
          >
            TableServe<span style={{ color: "#F4821F" }}>.</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock style={{ width: 14, height: 14, color: "#8A8070" }} />
          <span style={{ fontSize: 13, color: "#8A8070", fontWeight: 500 }}>
            Invite expires in 6 days
          </span>
        </div>
      </header>

      {/* Hero Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #F4821F 0%, #E06B10 100%)",
          padding: "40px 48px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: "absolute",
            top: -40,
            right: -40,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -60,
            right: 200,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,0.2)",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 100,
              padding: "4px 14px",
              marginBottom: 16,
            }}
          >
            <Star style={{ width: 13, height: 13, color: "#FFD700", fill: "#FFD700" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>
              Growth Plan — ₹2,499/month
            </span>
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: "#fff",
              margin: "0 0 10px",
              lineHeight: 1.2,
              letterSpacing: "-0.5px",
            }}
          >
            Welcome to TableServe,{" "}
            <span style={{ color: "#FFE5C8" }}>The Spice House</span>! 🎉
          </h1>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", margin: 0, fontWeight: 400 }}>
            Your restaurant is ready to go digital. Complete your account setup below and you'll be
            taking orders in under 10 minutes.
          </p>
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 420px",
          gap: 32,
          padding: "36px 48px 48px",
          maxWidth: 1200,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        {/* Left: Plan benefits + Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Plan card */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #F0EBE4",
              padding: "28px 32px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#1A1A1A",
                    margin: "0 0 4px",
                  }}
                >
                  What's included in your plan
                </h2>
                <p style={{ fontSize: 13, color: "#8A8070", margin: 0 }}>
                  Everything you need to run a modern, digital restaurant.
                </p>
              </div>
              <div
                style={{
                  background: PLAN.colorLight,
                  border: `1.5px solid ${PLAN.color}30`,
                  borderRadius: 10,
                  padding: "6px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: PLAN.color,
                    display: "inline-block",
                  }}
                />
                <span
                  style={{ fontSize: 14, fontWeight: 700, color: PLAN.color }}
                >
                  {PLAN.name} Plan
                </span>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px 24px",
              }}
            >
              {PLAN.features.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div
                    style={{
                      background: "#FEF0E4",
                      borderRadius: 8,
                      padding: 6,
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <f.icon style={{ width: 14, height: 14, color: "#F4821F" }} />
                  </div>
                  <span style={{ fontSize: 13.5, color: "#3A3530", fontWeight: 500, lineHeight: 1.4 }}>
                    {f.text}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 24,
                padding: "14px 18px",
                background: "#F9F5F1",
                borderRadius: 10,
                border: "1px dashed #E0D8D0",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Shield style={{ width: 16, height: 16, color: "#8A8070", flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: "#6B5F55", lineHeight: 1.5 }}>
                <strong>Revenue share:</strong> TableServe collects 2% of your monthly order value
                (GMV) automatically — no manual tracking needed.
              </span>
            </div>
          </div>

          {/* Setup steps */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #F0EBE4",
              padding: "28px 32px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#1A1A1A",
                margin: "0 0 6px",
              }}
            >
              Get live in 4 simple steps
            </h2>
            <p style={{ fontSize: 13, color: "#8A8070", margin: "0 0 24px" }}>
              Complete your account today and start accepting orders.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {STEPS.map((step, i) => (
                <div key={step.num} style={{ display: "flex", gap: 16 }}>
                  {/* Step indicator column */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: step.active ? "#F4821F" : step.done ? "#22C55E" : "#F5F0EB",
                        border: step.active ? "none" : step.done ? "none" : "2px solid #E0D8D0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: step.active || step.done ? "#fff" : "#B0A899",
                        fontSize: 14,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {step.done ? (
                        <CheckCircle2 style={{ width: 20, height: 20 }} />
                      ) : (
                        step.num
                      )}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        style={{
                          width: 2,
                          flex: 1,
                          minHeight: 28,
                          background: step.done ? "#22C55E40" : "#EDE9E4",
                          margin: "4px 0",
                        }}
                      />
                    )}
                  </div>
                  {/* Step content */}
                  <div style={{ paddingBottom: i < STEPS.length - 1 ? 20 : 0, paddingTop: 6 }}>
                    <p
                      style={{
                        margin: "0 0 3px",
                        fontSize: 14,
                        fontWeight: step.active ? 700 : 600,
                        color: step.active ? "#1A1A1A" : "#6B5F55",
                      }}
                    >
                      {step.label}
                      {step.active && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            fontWeight: 700,
                            background: "#FEF0E4",
                            color: "#F4821F",
                            borderRadius: 100,
                            padding: "2px 8px",
                            border: "1px solid #F4821F30",
                          }}
                        >
                          START HERE
                        </span>
                      )}
                    </p>
                    <p style={{ margin: 0, fontSize: 12.5, color: "#8A8070", lineHeight: 1.4 }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Account Setup Form */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #F0EBE4",
            padding: "32px 28px",
            boxShadow: "0 4px 24px rgba(244,130,31,0.1)",
            height: "fit-content",
            position: "sticky",
            top: 24,
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: "0 0 4px" }}>
              Create your account
            </h2>
            <p style={{ fontSize: 13, color: "#8A8070", margin: 0 }}>
              Step 1 of 4 — takes about 2 minutes
            </p>
            {/* Progress bar */}
            <div
              style={{
                marginTop: 14,
                height: 5,
                background: "#F5F0EB",
                borderRadius: 100,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: "25%",
                  height: "100%",
                  background: "linear-gradient(90deg, #F4821F, #E06B10)",
                  borderRadius: 100,
                }}
              />
            </div>
          </div>

          {/* Pre-filled restaurant info */}
          <div
            style={{
              background: "#F9F5F1",
              border: "1px solid #EDE9E4",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 22,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                background: "#FEF0E4",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ChefHat style={{ width: 18, height: 18, color: "#F4821F" }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#1A1A1A" }}>
                The Spice House
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#8A8070" }}>Mumbai · Growth Plan · Rahul Sharma</p>
            </div>
            <CheckCircle2
              style={{ width: 18, height: 18, color: "#22C55E", marginLeft: "auto", flexShrink: 0 }}
            />
          </div>

          {/* Form fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Phone */}
            <div>
              <label
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3A3530", marginBottom: 6 }}
              >
                Phone number
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: "1.5px solid #E5DDD5",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#FAFAF8",
                }}
              >
                <div
                  style={{
                    padding: "0 12px",
                    background: "#F5F0EB",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    borderRight: "1.5px solid #E5DDD5",
                    gap: 4,
                  }}
                >
                  <Phone style={{ width: 14, height: 14, color: "#8A8070" }} />
                  <span style={{ fontSize: 13, color: "#6B5F55", fontWeight: 600 }}>+91</span>
                </div>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    padding: "11px 14px",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#1A1A1A",
                    background: "transparent",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3A3530", marginBottom: 6 }}
              >
                Email address
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: "1.5px solid #E5DDD5",
                  borderRadius: 10,
                  background: "#FAFAF8",
                }}
              >
                <div style={{ padding: "0 12px", display: "flex", alignItems: "center" }}>
                  <Mail style={{ width: 14, height: 14, color: "#8A8070" }} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    padding: "11px 14px 11px 0",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#1A1A1A",
                    background: "transparent",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3A3530", marginBottom: 6 }}
              >
                Create a password
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: "1.5px solid #E5DDD5",
                  borderRadius: 10,
                  background: "#FAFAF8",
                }}
              >
                <div style={{ padding: "0 12px", display: "flex", alignItems: "center" }}>
                  <Lock style={{ width: 14, height: 14, color: "#8A8070" }} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    padding: "11px 0",
                    fontSize: 14,
                    color: "#1A1A1A",
                    background: "transparent",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "0 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    color: "#8A8070",
                  }}
                >
                  {showPassword ? (
                    <EyeOff style={{ width: 16, height: 16 }} />
                  ) : (
                    <Eye style={{ width: 16, height: 16 }} />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3A3530", marginBottom: 6 }}
              >
                Confirm password
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: "1.5px solid #E5DDD5",
                  borderRadius: 10,
                  background: "#FAFAF8",
                }}
              >
                <div style={{ padding: "0 12px", display: "flex", alignItems: "center" }}>
                  <Lock style={{ width: 14, height: 14, color: "#8A8070" }} />
                </div>
                <input
                  type={showConfirm ? "text" : "password"}
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    padding: "11px 0",
                    fontSize: 14,
                    color: "#1A1A1A",
                    background: "transparent",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                />
                <button
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "0 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    color: "#8A8070",
                  }}
                >
                  {showConfirm ? (
                    <EyeOff style={{ width: 16, height: 16 }} />
                  ) : (
                    <Eye style={{ width: 16, height: 16 }} />
                  )}
                </button>
              </div>
            </div>

            {/* Terms */}
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
                marginTop: 2,
              }}
            >
              <input
                type="checkbox"
                defaultChecked
                style={{ marginTop: 2, accentColor: "#F4821F", flexShrink: 0 }}
              />
              <span style={{ fontSize: 12, color: "#6B5F55", lineHeight: 1.5 }}>
                I agree to TableServe's{" "}
                <span style={{ color: "#F4821F", fontWeight: 600, cursor: "pointer" }}>
                  Terms of Service
                </span>{" "}
                and{" "}
                <span style={{ color: "#F4821F", fontWeight: 600, cursor: "pointer" }}>
                  Privacy Policy
                </span>
              </span>
            </label>

            {/* CTA */}
            <button
              style={{
                width: "100%",
                padding: "14px 0",
                background: "linear-gradient(135deg, #F4821F, #E06B10)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 4px 16px rgba(244,130,31,0.35)",
                marginTop: 4,
                letterSpacing: 0.1,
              }}
            >
              Create Account & Continue
              <ArrowRight style={{ width: 18, height: 18 }} />
            </button>

            <p style={{ fontSize: 12, color: "#8A8070", textAlign: "center", margin: 0 }}>
              Already have an account?{" "}
              <span style={{ color: "#F4821F", fontWeight: 600, cursor: "pointer" }}>
                Sign in here
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
