import type { Metadata } from "next";
import { RegistrationForm } from "./RegistrationForm";

export const metadata: Metadata = {
  title: "Request an account | SES Customs",
  description: "Staff access request for the SES Customs Valuation Portal.",
};

export default function RegistrationPage() {
  return <RegistrationForm />;
}
