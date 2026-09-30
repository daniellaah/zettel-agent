---
type: fleeting
created: 2026-05-02
tags: [inbox, recsys, experiment]
---
# recall@50 掉了

周三改了负采样（全部换成 in-batch，去掉随机负样本），离线 recall@50 从 0.31 掉到 0.27，热门 item 基本召不回来了。

怀疑是没加 logQ correction。

明天：加回 correction 再跑一版；另外单独看 tail item 的 recall 有没有涨。
