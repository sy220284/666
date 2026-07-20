# SceneBeat实体关联权威模型

> 状态：Active  
> 适用Schema：project.sqlite v15及以后  
> 对应任务：M3-02、M3-03

## 1. 权威边界

`scene_beat_entities`是SceneBeat与实体关联的权威关系表。人物和地点关联分别使用`role='character'`与`role='location'`。

`scene_beats.character_ids_json`和`scene_beats.location_ids_json`仅保留为旧合同兼容投影，不允许形成独立数据含义。Schema 15通过数据库触发器保证兼容投影与权威关系集合一致；删除影响预览、永久删除阻断及后续连续性读取均以`scene_beat_entities`为依据。

## 2. 写入规则

新建或修改人物、地点关联时必须同时满足：

1. Entity真实存在；
2. Entity与SceneBeat属于同一Project；
3. 人物关联只接受`entity_type='character'`；
4. 地点关联只接受`entity_type='location'`；
5. 新增关联时Entity必须为`active`；
6. 任一引用无效时整笔SceneBeat事务失败，不允许部分写入。

旧JSON合同入口仍可提交UUID数组，但数据库会先执行上述校验，再以集合差分同步到`scene_beat_entities`。直接通过Entity/Canon服务写入关系表时，兼容JSON投影同步更新。两条入口的结果必须幂等且不可漂移。

## 3. 归档语义

归档Entity不能接收新的SceneBeat引用。已经存在的引用必须保留，用于历史可追溯和永久删除影响预览：

- 归档不自动解除SceneBeat关联；
- SceneBeat修改无关字段时不得因既有归档引用失败；
- 作者可以显式移除既有归档引用；
- 只要引用仍存在，永久删除必须被阻断。

Renderer实体选择器默认提供当前项目的active人物和地点。编辑已有SceneBeat时，已选归档实体继续显示并标注“已归档”，避免打开表单即静默丢失引用。

## 4. Migration 15

`migrations/project/0015_scene_beat_entity_truth.sql`执行：

1. 检查旧JSON引用的项目归属和实体类型；
2. 将合法旧JSON引用回填到`scene_beat_entities`；
3. 为旧JSON入口增加存在性、项目、类型及新增归档引用校验；
4. 使用集合差分同步JSON输入到关系表；
5. 将关系表直接变更回写为兼容JSON投影；
6. 将项目Schema版本更新为15。

若旧数据库存在无法解析、实体缺失、跨项目或类型错误的引用，Migration必须原子失败并进入既有恢复流程，不得静默删除或猜测修复。

## 5. 验证要求

至少覆盖：

- 合法人物和地点关联双向同步；
- 不存在、跨项目、错误类型和新增归档Entity拒绝；
- 既有引用在Entity归档后继续保留；
- 关系集合与兼容JSON投影不可漂移；
- 删除影响预览统计旧入口产生的引用；
- Renderer只展示实体名称选择器，不暴露UUID手填入口；
- 真实Electron流程保存后Core返回相同人物、地点集合。
