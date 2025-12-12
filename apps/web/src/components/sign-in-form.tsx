import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { Button } from "./ui/button";

export default function SignInForm({
  onSwitchToSignUp,
}: {
  onSwitchToSignUp: () => void;
}) {
  const { t } = useTranslation();
  const { signIn } = useAuth();

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-6 text-center font-bold text-3xl">
        {t("web.signIn.title")}
      </h1>

      <div className="space-y-4">
        <Button className="w-full" onClick={signIn} type="button">
          {t("web.signIn.button")}
        </Button>

        <div className="mt-4 text-center">
          <Button
            className="text-indigo-600 hover:text-indigo-800"
            onClick={onSwitchToSignUp}
            variant="link"
          >
            {t("web.signIn.switchToSignUp")}
          </Button>
        </div>
      </div>
    </div>
  );
}
