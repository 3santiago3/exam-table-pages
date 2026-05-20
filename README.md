# exam-table-pages

## 数据加密部署（GitHub Pages）

项目默认读取 `data.enc`，不再读取 `data.json`。你在本地维护明文 `data.json`，每次更新后运行脚本生成 `data.enc` 再提交部署。

生成加密数据文件：

```bash
DATA_PASSWORD=你的口令 node encrypt-data.js
```

可选环境变量：

```bash
PBKDF2_ITER=600000 DATA_JSON=data.json DATA_ENC=data.enc DATA_PASSWORD=你的口令 node encrypt-data.js
```
