// This page is no longer needed in the new architecture.
// Redirected to Dashboard.
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function RestaurantDetail() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/restaurant/dashboard"); }, [navigate]);
  return null;
}
