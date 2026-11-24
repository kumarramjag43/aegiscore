import type { AgentStage } from "@aegiscore/core";

export type LogLevel = "info" | "warn" | "success" | "error";

export interface LogLine {
  id: number;
  stage: AgentStage | "system";
  level: LogLevel;
  message: string;
  at: number;
}

export type StageState = "pending" | "active" | "done" | "failed";
