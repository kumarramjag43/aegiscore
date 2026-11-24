import { codeSecurityPack } from "@aegiscore/core";
import { CodeMedicWorkspace } from "../components/CodeMedicWorkspace";

export default function HomePage() {
  const agents = [
    codeSecurityPack.agents.scanner,
    codeSecurityPack.agents.critic,
    codeSecurityPack.agents.healer,
    codeSecurityPack.agents.verifier,
  ];

  return (
    <CodeMedicWorkspace
      presets={codeSecurityPack.presets}
      agents={agents}
      actionLabel={codeSecurityPack.actionLabel}
      documentNoun={codeSecurityPack.documentNoun}
    />
  );
}
