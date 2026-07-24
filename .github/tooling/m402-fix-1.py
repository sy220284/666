from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old = r'''        connection
          .prepare(
            `INSERT INTO scene_beat_entities(project_id, scene_beat_id, entity_id, role, created_at)
             VALUES(?, ?, ?, 'character', ?)`,
          )
          .run(project.projectId, beatId, entityId, now);
'''
if text.count(old) != 1:
    raise SystemExit('duplicate scene beat entity fixture block not found')
script.write_text(text.replace(old, '', 1))
