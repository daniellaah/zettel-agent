# Fixture vault sources

## Technical corpus, 2026-10-02

The corpus uses **45 original technical works**, plus the preserved Ahrens baseline below. The second expansion adds 40 literature and 60 permanent notes from 11 additional works. Literature was authored after reading the listed passages; per-note passage scopes, downloaded document hashes and edition records are in [`technical-note-audit.json`](technical-note-audit.json). Formal published work titles remain in literature-note metadata; permanent sources are literature-note wikilinks. Raw PDFs and full articles remain outside the vault and repository.

Year means original publication or initial preprint year. In particular, BPR was published at UAI 2009 and later posted on arXiv in 2012; SWE-bench was first posted in 2023 and the read edition is revised in 2024. The Python statistical-learning book is the 2023 edition. Undated documentation leaves year empty. Fixed arXiv URLs identify the read versions. Mutable HTML is identified by retrieval date and hash; a release URL or publication date does not guarantee unchanged future bytes.

| Work | Author | Original year |
|---|---|---|
| [Deep Neural Networks for YouTube Recommendations](https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/) | Paul Covington, Jay Adams, Emre Sargin | 2016 |
| [Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations](https://research.google/pubs/sampling-bias-corrected-neural-modeling-for-large-corpus-item-recommendations/) | Xinyang Yi et al. | 2019 |
| [Billion-scale similarity search with GPUs](https://arxiv.org/abs/1702.08734) | Jeff Johnson, Matthijs Douze, Hervé Jégou | 2017 |
| [Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs](https://arxiv.org/abs/1603.09320) | Yu. A. Malkov, D. A. Yashunin | 2016 |
| [Multi-Interest Network with Dynamic Routing for Recommendation at Tmall](https://arxiv.org/abs/1904.08030) | Chao Li et al. | 2019 |
| [Controllable Multi-Interest Framework for Recommendation](https://arxiv.org/abs/2005.09347) | Yukuo Cen et al. | 2020 |
| [Item-based Collaborative Filtering Recommendation Algorithms](https://www.ra.ethz.ch/CDstore/www10/papers/519/) | Badrul Sarwar, George Karypis, Joseph Konstan, John Riedl | 2001 |
| [Large Scale Product Graph Construction for Recommendation in E-commerce](https://arxiv.org/abs/2010.05525) | Xiaoyong Yang et al. | 2020 |
| [Factorization Machines](https://ieeexplore.ieee.org/document/5694074) | Steffen Rendle | 2010 |
| [Rules of Machine Learning: Best Practices for ML Engineering](https://developers.google.com/machine-learning/guides/rules-of-ml/) | Martin Zinkevich | Undated |
| [Hidden Technical Debt in Machine Learning Systems](https://research.google/pubs/hidden-technical-debt-in-machine-learning-systems/) | D. Sculley et al. | 2015 |
| [Patterns of Trustworthy Experimentation: Pre-Experiment Stage](https://www.microsoft.com/en-us/research/articles/patterns-of-trustworthy-experimentation-pre-experiment-stage/) | Widad Machmouchi, Somit Gupta, Ruhan Zhang, Aleksander Fabijan | 2020 |
| [Patterns of Trustworthy Experimentation: During-Experiment Stage](https://www.microsoft.com/en-us/research/articles/patterns-of-trustworthy-experimentation-during-experiment-stage/) | Widad Machmouchi, Somit Gupta, Ruhan Zhang | 2021 |
| [Deep Learning](https://www.deeplearningbook.org/) | Ian Goodfellow, Yoshua Bengio, Aaron Courville | 2016 |
| [Dive into Deep Learning](https://d2l.ai/) | Aston Zhang, Zachary C. Lipton, Mu Li, Alexander J. Smola | 2023 |
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | Ashish Vaswani et al. | 2017 |
| [Introduction to Information Retrieval](https://nlp.stanford.edu/IR-book/) | Christopher D. Manning, Prabhakar Raghavan, Hinrich Schütze | 2008 |
| [Dense Passage Retrieval for Open-Domain Question Answering](https://arxiv.org/abs/2004.04906) | Vladimir Karpukhin et al. | 2020 |
| [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401) | Patrick Lewis et al. | 2020 |
| [Reciprocal rank fusion outperforms condorcet and individual rank learning methods](https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf) | Gordon V. Cormack, Charles L. A. Clarke, Stefan Büttcher | 2009 |
| [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) | Nelson F. Liu et al. | 2023 |
| [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) | Shunyu Yao et al. | 2022 |
| [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) | Erik Schluntz, Barry Zhang | 2024 |
| [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Prithvi Rajasekaran, Ethan Dixon, Carly Ryan, Jeremy Hadfield | 2025 |
| [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Mikaela Grace, Jeremy Hadfield, Rodrigo Olivares, Jiri De Jonghe | 2026 |
| [Enabling Large Language Models to Generate Text with Citations](https://arxiv.org/abs/2305.14627) | Tianyu Gao, Howard Yen, Jiatong Yu, Danqi Chen | 2023 |
| [Inspect documentation](https://inspect.aisi.org.uk/) | UK AI Security Institute | Undated |
| [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) | Edward J. Hu et al. | 2021 |
| [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314) | Tim Dettmers et al. | 2023 |
| [Direct Preference Optimization: Your Language Model is Secretly a Reward Model](https://arxiv.org/abs/2305.18290) | Rafael Rafailov et al. | 2023 |
| [DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models](https://arxiv.org/abs/2402.03300) | Zhihong Shao et al. | 2024 |
| [DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning](https://arxiv.org/abs/2501.12948) | DeepSeek-AI | 2025 |
| [Qwen3 Technical Report](https://arxiv.org/abs/2505.09388) | Qwen Team | 2025 |
| [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) | Woosuk Kwon et al. | 2023 |
| [An Introduction to Statistical Learning: with Applications in Python](https://www.statlearning.com/) | Gareth James, Daniela Witten, Trevor Hastie, Robert Tibshirani, Jonathan Taylor | 2023 |
| [XGBoost: A Scalable Tree Boosting System](https://arxiv.org/abs/1603.02754v3) | Tianqi Chen, Carlos Guestrin | 2016 |
| [BPR: Bayesian Personalized Ranking from Implicit Feedback](https://arxiv.org/abs/1205.2618v1) | Steffen Rendle, Christoph Freudenthaler, Zeno Gantner, Lars Schmidt-Thieme | 2009 |
| [Self-Attentive Sequential Recommendation](https://arxiv.org/abs/1808.09781v1) | Wang-Cheng Kang, Julian McAuley | 2018 |
| [A Simple Framework for Contrastive Learning of Visual Representations](https://arxiv.org/abs/2002.05709v3) | Ting Chen, Simon Kornblith, Mohammad Norouzi, Geoffrey Hinton | 2020 |
| [TFX: A TensorFlow-Based Production-Scale Machine Learning Platform](https://research.google/pubs/tfx-a-tensorflow-based-production-scale-machine-learning-platform/) | Denis Baylor et al. | 2017 |
| [Apache Flink documentation](https://nightlies.apache.org/flink/flink-docs-release-2.3/) | Apache Software Foundation | Undated |
| [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135v2) | Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, Christopher Ré | 2022 |
| [Fast Inference from Transformers via Speculative Decoding](https://arxiv.org/abs/2211.17192v2) | Yaniv Leviathan, Matan Kalman, Yossi Matias | 2022 |
| [ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT](https://arxiv.org/abs/2004.12832v2) | Omar Khattab, Matei Zaharia | 2020 |
| [SWE-bench: Can Language Models Resolve Real-World GitHub Issues?](https://arxiv.org/abs/2310.06770v3) | Carlos E. Jimenez, John Yang, Alexander Wettig, Shunyu Yao, Kexin Pei, Ofir Press, Karthik Narasimhan | 2023 |

## Preserved baseline: Ahrens literature notes

The owner requested deletion of all existing notes and creation of four literature records on 2026-10-01. The sole source for this batch is Sönke Ahrens’s 2017 *How to Take Smart Notes*, supplied by the owner as a 156-page PDF. The title and copyright pages identify the edition. The supplied Schmidt chapter remains available for later work but has no current fixture note.

The notes use only `type`, `created`, `source_title`, `author`, `year` and `source` in metadata. Both `source_title` and `source` identify the published book by its full title, not the supplied PDF filename. Their bodies contain a title and faithful paraphrase without added judgments. No source PDF is copied into the repository.

### Source audit

The positions below refer to one-based pages in the supplied PDF. They are an authoring audit outside the vault, not fields required by the template.

| Literature record | Source passages checked |
|---|---|
| [Zettelkasten note system](vault/02-Zettelkasten/Literature/Zettelkasten%20note%20system.md) | §1.3, PDF pp. 22–24; §2.1, PDF pp. 27–29 |
| [Fleeting notes](vault/02-Zettelkasten/Literature/Fleeting%20notes.md) | §2.1, PDF p. 27; ch. 6, PDF pp. 43–45 |
| [Literature notes](vault/02-Zettelkasten/Literature/Literature%20notes.md) | §2.1, PDF p. 27; §10.1, PDF pp. 73–75 |
| [Permanent notes](vault/02-Zettelkasten/Literature/Permanent%20notes.md) | §2.1, PDF pp. 27–28; ch. 6, PDF pp. 43–46; §12.7, PDF pp. 119–120 |

All four records are literature notes, including those whose subjects are fleeting and permanent notes.

### Approved permanent note

On 2026-10-01, the owner approved and requested creation of [A permanent note must make its necessary context explicit](vault/02-Zettelkasten/Permanent/A%20permanent%20note%20must%20make%20its%20necessary%20context%20explicit.md). Its `source` list links the literature records “Literature notes” and “Permanent notes”. It develops their distinction into a practical check for missing premises, definitions and qualifications. That check is a synthesis proposed in discussion and approved by the owner, not a quotation or faithful paraphrase attributed to Ahrens.

## Historical topic proposal: LangChain

Historical sources from the previous v2 attempt. All corresponding notes were deleted at the owner’s request on 2026-10-01. Topic and source selection was restarted with the owner; this list does not authorize recreating those notes. Each newly selected source becomes one literature note. [`vault-design.md`](vault-design.md) describes the vault.

### Decisions

- **2026-10-01, the reading lens.** The notes record a source's core design ideas, the ones that provoke thinking, and leave out API details that change often. The sources are therefore organised by idea rather than by product. Essays come first; docs pages are used only where they are conceptual.
- **2026-10-01, changes of view.** Where a view changed, both the earlier and the later source are kept, because why the authors changed their mind is itself one of the ideas.
- **2026-10-01, literature notes first.** Fleeting, permanent and writing notes come later. No far clusters for now.
- **2026-10-01, rewrite.** The first six notes (long source summaries) were deleted. At that point, notes followed the earlier keyword-bullet template. The current pilot uses the section-based design in `vault-design.md`.

### About this list

- **URLs:** every URL returned HTTP 200 on 2026-10-01.
  - Old `blog.langchain.com` URLs redirect to `www.langchain.com/blog/…`.
  - `cognition.ai` redirects to `cognition.com`.
- **Dates:**
  - Docs pages show no date. Their date is the last commit to the page's source file in `langchain-ai/docs`, marked "(commit)".
  - Blog posts show their publication date.
- **Facts come from the source.** A literature note is written from the page itself, downloaded at writing time. Neither this list nor memory is a source.
- **Status:**
  - **deleted:** previously written; the literature note was deleted during the reset.
  - Reserve entries are historical candidates, pending a fresh choice by the owner.

### Ideas

| # | Idea | Sources |
|---|---|---|
| 1 | Context engineering is the core of building agents | E1, E2 |
| 2 | The harness should get thinner as models get stronger | D1 → D6 |
| 3 | Low abstraction and control over hidden prompts: LangChain's own lesson | A1, E6, B1 |
| 4 | Derive the runtime from the properties of LLMs | B1 |
| 5 | Workflows and agents form a spectrum | E2 → E3 |
| 6 | Multi-agent design is about isolating context, and practitioners disagree on it | A8, X1, X2 |
| 7 | The ladder of evaluation | C2, D5 → D6 |
| 8 | Memory is a design space | E4, B5 |
| 9 | Ambient agents: triggered by events, not chat | E5 |

### Sources

| ID | Title | URL | Author | Date | Type | Status |
|---|---|---|---|---|---|---|
| E1 | Context Engineering | https://www.langchain.com/blog/context-engineering-for-agents | The LangChain Team | 2025-07-02 | blog | deleted |
| E2 | How to think about agent frameworks | https://www.langchain.com/blog/how-to-think-about-agent-frameworks | Harrison Chase | 2025-04-20 | blog | deleted |
| E3 | Not Another Workflow Builder | https://www.langchain.com/blog/not-another-workflow-builder | Harrison Chase | 2025-10-07 | blog | deleted |
| E4 | Memory for agents | https://www.langchain.com/blog/memory-for-agents | Harrison Chase | 2024-10-19 | blog | deleted |
| E5 | Introducing ambient agents | https://www.langchain.com/blog/introducing-ambient-agents | Harrison Chase | 2025-01-14 | blog | deleted |
| E6 | On Agent Frameworks and Agent Observability | https://www.langchain.com/blog/on-agent-frameworks-and-agent-observability | Harrison Chase | 2026-02-12 | blog | deleted |
| D1 | Deep Agents | https://www.langchain.com/blog/deep-agents | Harrison Chase | 2025-07-30 | blog | deleted |
| D5 | Evaluating Deep Agents: Our Learnings | https://www.langchain.com/blog/evaluating-deep-agents-our-learnings | The LangChain Team | 2025-12-03 | blog | deleted |
| D6 | How We Benchmark Deep Agents | https://www.langchain.com/blog/how-we-benchmark-deep-agents | Nick Hollon, Harrison Chase | 2026-07-23 | blog | deleted |
| B1 | Building LangGraph: Designing an Agent Runtime from first principles | https://www.langchain.com/blog/building-langgraph | Nuno Campos | 2025-09-04 | blog | deleted |
| A1 | Philosophy | https://docs.langchain.com/oss/python/langchain/philosophy | LangChain | 2026-04-21 (commit) | docs | deleted |
| A8 | Multi-agent | https://docs.langchain.com/oss/python/langchain/multi-agent/index | LangChain | 2026-05-29 (commit) | docs | deleted |
| B5 | Memory overview | https://docs.langchain.com/oss/python/concepts/memory | LangChain | 2026-07-28 (commit) | docs | deleted |
| C2 | Evaluation concepts | https://docs.langchain.com/langsmith/evaluation-concepts | LangChain | 2026-09-25 (commit) | docs | deleted |
| X1 | Don't Build Multi-Agents | https://cognition.com/blog/dont-build-multi-agents | Walden Yan (Cognition) | 2025-06-12 | blog | deleted |
| X2 | How we built our multi-agent research system | https://www.anthropic.com/engineering/multi-agent-research-system | Jeremy Hadfield, Barry Zhang, Kenneth Lien, Florian Scholz, Jeremy Fox, Daniel Ford (Anthropic) | 2025-06-13 | blog | deleted |

### Reserve

Verified on 2026-10-01 and not yet chosen. Paths are on docs.langchain.com and blog slugs are on www.langchain.com/blog.

| Source | Kind |
|---|---|
| Graph API overview, `/oss/python/langgraph/graph-api` | Docs, mostly API |
| Checkpointers, `/oss/python/langgraph/checkpointers` | Docs, mostly API |
| Interrupts, `/oss/python/langgraph/interrupts` | Docs, mostly API |
| Runtimes, frameworks, and harnesses, `/oss/python/concepts/products` | Docs, conceptual |
| Agents, `/oss/python/langchain/agents` | Docs, mostly API |
| Custom middleware, `/oss/python/langchain/middleware/custom` | Docs, mostly API |
| Structured output, `/oss/python/langchain/structured-output` | Docs, mostly API |
| Retrieval, `/oss/python/deepagents/retrieval` | Docs |
| Migrate from langgraph-supervisor, `/oss/python/migrate/langgraph-supervisor` | Docs |
| Observability concepts, `/langsmith/observability-concepts` | Docs |
| Trajectory evaluations, `/langsmith/trajectory-evals` | Docs |
| Prompt engineering concepts, `/langsmith/prompt-engineering-concepts` | Docs |
| LangSmith Deployment, `/langsmith/deployment` | Docs |
| Context engineering in Deep Agents, `/oss/python/deepagents/context-engineering` | Docs |
| langchain-ai/deepagents (README) | Repository |
| `langchain-langgraph-1dot0` (2025-10-22) | Blog |
| `agent-middleware` (2025-09-08) | Blog |
| `langgraph` (2024-01-17) | Blog |
| `benchmarking-multi-agent-architectures` (2025-06-10) | Blog |
| `delta-channels-evolving-agent-runtime` (2026-05-12) | Blog |
| `doubling-down-on-deepagents` (2025-10-28) | Blog |
| `langgraph-platform-ga` (2025-05-14) | Blog |
| `the-rise-of-context-engineering` (2025-06-23) | Blog |
| `agent-frameworks-runtimes-and-harnesses-oh-my` (2025-10-25) | Blog |
| `what-is-a-cognitive-architecture` (2024-07-06) | Blog |
| `the-anatomy-of-an-agent-harness` (2026-03-11) | Blog |
| `improving-deep-agents-with-harness-engineering` (2026-02-17) | Blog |
| `3-years-of-graph-engineering-with-langgraph` (2026-07-22) | Blog |
| Anthropic, "Building effective agents" | External essay |
| ReAct (arXiv 2210.03629) | Paper |
| CoALA (arXiv 2309.02427) | Paper |
