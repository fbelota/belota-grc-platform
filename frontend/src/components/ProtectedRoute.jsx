import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Shield } from "./Logo";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="min-h-screen flex items-center justify-center bg-belota-bg">
        <Shield className="w-14 h-14 animate-pulse" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
