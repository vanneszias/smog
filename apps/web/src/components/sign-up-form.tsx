import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { Button } from "./ui/button";

export default function SignUpForm({
  onSwitchToSignIn,
}: {
  onSwitchToSignIn: () => void;
}) {
  const { t } = useTranslation();
  const { signIn } = useAuth();

  // WorkOS AuthKit uses the same flow for sign in and sign up
  const handleSignUp = () => {
    signIn();
  };

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-6 text-center font-bold text-3xl">
        {t("web.signUp.title")}
      </h1>

      <div className="space-y-4">
        <Button className="w-full" onClick={handleSignUp} type="button">
          {t("web.signUp.button")}
        </Button>

        <div className="mt-4 text-center">
          <Button
            className="text-indigo-600 hover:text-indigo-800"
            onClick={onSwitchToSignIn}
            variant="link"
          >
            {t("web.signUp.switchToSignIn")}
          </Button>
        </div>
      </div>
    </div>
  );
}
