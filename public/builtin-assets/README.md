# 内置素材包目录

> 此目录的素材会在应用启动时自动导入用户的素材库（按 manifest.json 版本号增量导入）。

## 放置约定

```
builtin-assets/
├── stickers/          表情包图片（文件名即 AI 看到的描述）
├── avatars/
│   ├── male/          男性头像（脚本会自动打「男」标签）
│   └── female/        女性头像（脚本会自动打「女」标签）
└── manifest.json      由脚本生成，勿手改
```

## 工作流

1. 把表情图片放进 `stickers/`（支持 jpg/png/gif/webp）
   - ChineseBQB 命名（如「滑稽大佬00001-360度鄙视你.gif」）会自动清洗成「360度鄙视你」
   - 纯编号文件名（无语义）会被脚本跳过并提示
   - 同描述重复会跳过
2. 把头像图片放进 `avatars/male/` 和 `avatars/female/`
   - 脚本会把它们移到 `avatars/` 平级并加 `male_`/`female_` 前缀
3. 项目根目录运行：`node scripts/build-asset-manifest.mjs`
4. 启动应用 → 自动后台导入（控制台可见导入日志）

## 注意

- 表情 >400KB 会在脚本输出中警告（仍会收录），建议剔除特别大的 GIF 控制存储体积
- 重新跑脚本会生成新版本号，应用会增量导入新增素材（表情按描述去重）
- 想强制重导：清浏览器 localStorage 的 `boxworld_builtin_assets_version`