import type { Task } from "../types.js";
import { docs } from "./docs.js";
import { agents } from "./agents.js";
import { commit } from "./commit.js";
import { issue } from "./issue.js";
import { pr } from "./pr.js";

export const setup = "Setup";

export const tasks: Task[] = [docs, agents, commit, issue, pr];

