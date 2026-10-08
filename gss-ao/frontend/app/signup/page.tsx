import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <AuthCard initialMode="signup" />
      </Suspense>
    </div>
  );
}
