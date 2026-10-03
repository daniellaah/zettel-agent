/** Frozen in docs/release-live-protocol.md before paid dispatch. */
export const RELEASE_SCENARIOS = [
  {
    id: "1",
    question:
      "In my notes, what does four-bit weight storage in QLoRA imply about computation precision? Answer briefly with citations.",
    reset: true,
  },
  {
    id: "2",
    question:
      "Compare QLoRA paged optimizers with vLLM PagedAttention using my notes. Keep the comparison concise and cite each mechanism.",
    reset: true,
  },
  {
    id: "3",
    question:
      "Which of those mechanisms is used during inference, and why? Cite the supporting note.",
    reset: false,
  },
  {
    id: "4",
    question: "我的笔记中，QLoRA 的四位权重存储是否意味着矩阵计算也是四位？请简短回答并引用。",
    reset: true,
  },
  {
    id: "5",
    question:
      "Do my notes contain a measured online CTR improvement from my own SASRec deployment? If not, say what is missing; do not estimate it.",
    reset: true,
  },
  {
    id: "6-cancel",
    question: "Explain how my notes distinguish QLoRA and PagedAttention with citations.",
    reset: true,
    cancel: true,
  },
  {
    id: "6",
    question: "What is QLoRA storage precision? Answer briefly from my notes with citations.",
    reset: false,
  },
  {
    id: "7-error",
    question: "What is QLoRA storage precision? Answer briefly from my notes with citations.",
    reset: true,
    wrongModel: true,
  },
  {
    id: "7",
    question: "What is QLoRA storage precision? Answer briefly from my notes with citations.",
    reset: false,
  },
  {
    id: "8",
    question: "What is QLoRA storage precision? Answer in one short cited sentence using my notes.",
    reset: true,
    review: true,
  },
];
