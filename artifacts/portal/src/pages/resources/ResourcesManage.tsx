import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ResourcesManage() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/restaurant/resources", { replace: true });
  }, [navigate]);
  return null;
}
