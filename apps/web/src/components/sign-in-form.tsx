import { useAuth } from "@/lib/auth-context";
import { Button } from "./ui/button";

export default function SignInForm({
  onSwitchToSignUp,
}: {
  onSwitchToSignUp: () => void;
}) {
  const { signIn } = useAuth();

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-6 text-center font-bold text-3xl">Welcome Back</h1>

      <div className="space-y-4">
        <Button className="w-full" onClick={signIn} type="button">
          Sign In with WorkOS
        </Button>

        <div className="mt-4 text-center">
          <Button
            className="text-indigo-600 hover:text-indigo-800"
            onClick={onSwitchToSignUp}
            variant="link"
          >
            Need an account? Sign Up
          </Button>
        </div>
      </div>
    </div>
  );
}
