import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

key = sys.argv[sys.argv.index('--') + 1]
root = Path(__file__).resolve().parents[1]
config = {
    'patasola': ['Patasola', 'Retopo_Pelo', 'Retopo_Top', 'Retopo_Falda'],
    'hojarasquin': ['Hojarazquin'],
    'mohan': ['Mohan_baja', 'dreadlocks', 'falda_low', 'bara_low'],
}

def color_material(name, rgba, roughness=0.85):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

def add_light(name, location, energy, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()

source = [bpy.data.objects[name] for name in config[key]]
depsgraph = bpy.context.evaluated_depsgraph_get()
copies = []
for obj in source:
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    copy = bpy.data.objects.new(obj.name + '_AR', mesh)
    bpy.context.collection.objects.link(copy)
    copy.matrix_world = obj.matrix_world.copy()
    copies.append(copy)

# Lower the outstretched arms in the static AR copies; do not touch the source rigs.
if key in {'hojarasquin', 'mohan'}:
    body = copies[0]
    if key == 'hojarasquin':
        vertical = 1  # this source model was authored with Y as its height
        shoulder_x, shoulder_h, start_x, full_x, angle = 0.35, 0.25, 0.37, 0.55, math.radians(48)
    else:
        vertical = 2
        shoulder_x, shoulder_h, start_x, full_x, angle = 0.76, 3.67, 0.72, 1.10, math.radians(65)
    for vert in body.data.vertices:
        co = vert.co
        ax = abs(co.x)
        height = co[vertical]
        horizontal_weight = max(0, min(1, (ax - start_x) / (full_x - start_x)))
        vertical_weight = (1 if height > 2.8 else 0) if key == 'mohan' else max(0, min(1, (height - (shoulder_h - 0.2)) / 0.24))
        w = horizontal_weight * vertical_weight
        if w == 0:
            continue
        side = 1 if co.x >= 0 else -1
        dx = ax - shoulder_x
        dh = height - shoulder_h
        a = angle * w
        co.x = side * (shoulder_x + dx * math.cos(a) + dh * math.sin(a))
        co[vertical] = shoulder_h - dx * math.sin(a) + dh * math.cos(a)
    body.data.update()
    if key == 'hojarasquin':
        # Blender source is Y-up; GLB/AR expects the character to stand on Z.
        for obj in copies:
            obj.rotation_euler.x = math.radians(90)

for obj in list(bpy.data.objects):
    if obj not in copies:
        bpy.data.objects.remove(obj, do_unlink=True)

# One still image per approved model. The original .blend files stay untouched.
if key == 'mohan':
    colors = {
        'Mohan_baja': (0.39, 0.24, 0.15, 1),
        'dreadlocks': (0.10, 0.075, 0.055, 1),
        'falda_low': (0.31, 0.26, 0.19, 1),
        'bara_low': (0.13, 0.10, 0.075, 1),
    }
    for obj in copies:
        obj.data.materials.clear()
        obj.data.materials.append(color_material(obj.name + '_fallback', colors[obj.name.removesuffix('_AR')]))

for obj in bpy.context.selected_objects:
    obj.select_set(False)
for obj in copies:
    obj.select_set(True)
bpy.context.view_layer.objects.active = copies[0]
glb = root / 'assets' / f'{key}.glb'
glb.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_yup=True, export_apply=True)
print('EXPORTED', glb)

points = [obj.matrix_world @ Vector(corner) for obj in copies for corner in obj.bound_box]
lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
center = (lo + hi) / 2
size = hi - lo
distance = max(size) * 2.6

camera_data = bpy.data.cameras.new('Figura camera')
camera = bpy.data.objects.new('Figura camera', camera_data)
bpy.context.collection.objects.link(camera)
camera.location = center + Vector((distance * 0.45, -distance, distance * 0.28))
camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = max(size.z * 1.28, size.x * 1.72, size.y * 1.35)
bpy.context.scene.camera = camera
add_light('Figura key', center + Vector((distance * 0.4, -distance * 0.55, distance * 0.8)), 900, max(size) * 2)
add_light('Figura fill', center + Vector((-distance * 0.55, -distance * 0.1, distance * 0.4)), 550, max(size) * 2)
add_light('Figura rim', center + Vector((0, distance * 0.7, distance * 0.55)), 1100, max(size) * 2)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = str(root / 'figura' / f'{key}-figura.png')
scene.world.color = (0.12, 0.12, 0.12)
bpy.ops.render.render(write_still=True)
print('RENDERED', scene.render.filepath)
