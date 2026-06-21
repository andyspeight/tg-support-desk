// Variable substitution for canned responses (the Luna-style bit). Tokens:
//   {{first_name}} — customer's first name
//   {{name}}       — customer's full name
//   {{agent}}      — the replying agent's name
//   {{ticket}}     — the ticket reference (e.g. #1234)
// Unknown or unfilled tokens are left untouched, so nothing is silently dropped
// and the agent can see what still needs a value. Pure + testable.

export type CannedVars = {
  first_name?: string;
  name?: string;
  agent?: string;
  ticket?: string;
};

export function applyCannedVars(body: string, vars: CannedVars): string {
  return body.replace(/\{\{\s*(first_name|name|agent|ticket)\s*\}\}/gi, (match, key: string) => {
    const value = vars[key.toLowerCase() as keyof CannedVars];
    return value && value.trim() ? value : match;
  });
}
