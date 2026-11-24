import { contractFraudPack } from "@aegiscore/core";
import { LexGuardWorkspace } from "../components/LexGuardWorkspace";

export default function HomePage() {
  const agents = [
    contractFraudPack.agents.scanner,
    contractFraudPack.agents.critic,
    contractFraudPack.agents.healer,
    contractFraudPack.agents.verifier,
  ];

  return (
    <LexGuardWorkspace
      presets={contractFraudPack.presets}
      agents={agents}
      actionLabel={contractFraudPack.actionLabel}
      documentNoun={contractFraudPack.documentNoun}
    />
  );
}
