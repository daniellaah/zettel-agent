/** Live UI smoke scenarios on the current frozen corpus; quality is recorded, not asserted. */
const P = "02-Zettelkasten/Permanent/";
const L = "02-Zettelkasten/Literature/";

export const ATTACH_NOTE = "Four-bit weight storage does not mean four-bit arithmetic everywhere";

export interface Scenario {
  id: string;
  question: string;
  followUp?: boolean;
  expect: string[];
  what: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "lookup",
    question: "Swing 算法如何使用共同点击用户的证据？",
    expect: [`${L}User-pair evidence in Swing similarity.md`],
    what: "direct technical lookup (zh)",
  },
  {
    id: "follow-up",
    question: "那 LogQ 校正又是解决什么问题的？",
    followUp: true,
    expect: [`${L}In-batch negatives and sampling correction in neural retrieval.md`],
    what: "multi-turn with tool history replayed",
  },
  {
    id: "cross-lingual",
    question: "QLoRA 的四位权重存储是否意味着矩阵计算也都是四位的？",
    expect: [`${P}${ATTACH_NOTE}.md`, `${L}Storage and computation precision in QLoRA.md`],
    what: "zh question, English technical notes",
  },
  {
    id: "no-answer",
    question: "Do these notes contain a measured online CTR improvement from my SASRec deployment?",
    expect: [],
    what: "missing owner measurement",
  },
  {
    id: "provenance",
    question:
      "Which literature notes are the direct sources of [[HNSW query tuning cannot replace construction quality]], and what do they support?",
    expect: [
      `${L}HNSW construction parameters and neighbor selection.md`,
      `${L}Hierarchical search and insertion in HNSW.md`,
    ],
    what: "source metadata and literature evidence",
  },
  {
    id: "orphans",
    question: "Which literature notes have no incoming or outgoing note links?",
    expect: [`${L}Zettelkasten note system.md`, `${L}Fleeting notes.md`],
    what: "graph: orphan literature notes",
  },
  {
    id: "comparison",
    question: "How do QLoRA paged optimizers differ from vLLM PagedAttention?",
    expect: [
      `${L}Paged optimizer states for training memory spikes.md`,
      `${L}PagedAttention and logical KV-cache blocks.md`,
    ],
    what: "compare distinct memory lifecycles",
  },
  {
    id: "connections",
    question:
      "How does [[Persistent memory requires a retrieval decision as well as storage]] connect to [[Retrieval coverage and evidence use need separate measurements]] and the literature behind them?",
    expect: [
      `${P}Persistent memory requires a retrieval decision as well as storage.md`,
      `${P}Retrieval coverage and evidence use need separate measurements.md`,
      `${L}Structured notes outside the agent context window.md`,
    ],
    what: "related notes and literature provenance",
  },
  {
    id: "authorship",
    question:
      "Turn [[Storage and computation precision in QLoRA]] into a permanent note and save it to my vault for me.",
    expect: [`${L}Storage and computation precision in QLoRA.md`],
    what: "request exceeds read-only agent capabilities",
  },
];
