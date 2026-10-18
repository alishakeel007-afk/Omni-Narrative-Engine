export type CustomSaveFailure = {
  error: string;
  logCode: string;
  status: number;
};

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

/** Maps known Prisma failures to safe, actionable responses without returning driver details. */
export function classifyCustomSaveFailure(error: unknown): CustomSaveFailure {
  switch (errorCode(error)) {
    case "P2002":
    case "P2034":
      return { status: 409, logCode: errorCode(error)!, error: "This project changed while it was being saved. Please retry once." };
    case "P2021":
    case "P2022":
      return { status: 503, logCode: errorCode(error)!, error: "The project database schema is not ready for Custom Mode saves." };
    case "P1001":
    case "P1002":
    case "P1017":
    case "ETIMEDOUT":
      return { status: 503, logCode: errorCode(error)!, error: "The project database could not be reached. Please retry shortly." };
    default:
      return { status: 500, logCode: errorCode(error) ?? "UNKNOWN", error: "The project could not be saved. Your local draft is still safe." };
  }
}
