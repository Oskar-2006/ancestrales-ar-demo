"""Exportación estática de personajes propios para la demo AR.

Blender -b origen.blend --python este_archivo -- clave
"""
import bpy
import math
import os
import sys
from mathutils import Matrix, Vector

KEY = sys.argv[sys.argv.index('--') + 1]
CONFIG = {
    'enemigo1': ('ENEMIGO 1', ['ENEMIGO 1'], (0.20, 0.45, 0.56)),
    'enemigo2': ('ENEMIGO 2', ['ENEMIGO 2'], (0.38, 0.38, 0.55)),
    'enemigo3': ('ENEMIGO 3', ['ENEMIGO 3'], (0.56, 0.37, 0.38)),
    'hombrecaiman': ('HOMBRE CAIMÁN', ['Hombre Caiman'], (0.29, 0.49, 0.40)),
    'madremonte': ('MADREMONTE', ['mujer_baja', 'pelo'], (0.29, 0.46, 0.31)),
}
TITLE, NAMES, ACCENT = CONFIG[KEY]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET = os.path.join(ROOT, 'assets', KEY + '.glb')
FIGURE = os.path.join(ROOT, 'figura', KEY + '-figura.png')

def bounds(objects):
    pts = [o.matrix_world @ Vector(corner) for o in objects for corner in o.bound_box]
    return Vector(tuple(min(p[i] for p in pts) for i in range(3))), Vector(tuple(max(p[i] for p in pts) for i in range(3)))

def material(name, color, roughness=0.8, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return m

# Bake the evaluated visible shape as a static mesh; retain the original materials.
src = [bpy.data.objects[n] for n in NAMES]
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
baked = []
for o in src:
    evaluated = o.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    obj = bpy.data.objects.new(o.name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.matrix_world = o.matrix_world.copy()
    baked.append(obj)

# The creatures are quadrupeds, already oriented with Z upward. Their long Y
# dimension runs from snout to tail; rotating it upright puts the tail in the air.

bpy.context.view_layer.update()
lo, hi = bounds(baked)
height = hi.z - lo.z
width = hi.x - lo.x
depth = hi.y - lo.y
scale = min(1.60 / height, 2.0 / max(width, depth))
offset = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
for o in baked:
    o.matrix_world = Matrix.Scale(scale, 4) @ Matrix.Translation(offset) @ o.matrix_world
bpy.context.view_layer.update()
lo, hi = bounds(baked)
print('AR_BOUNDS', KEY, list(lo), list(hi))

# Simple sculpt pose for the two humanoids supplied in T-pose. This bends the
# arms at their shoulders while preserving the original mesh, UVs and texture.
if KEY in ('hombrecaiman', 'madremonte'):
    from mathutils import Matrix
    def smooth(v):
        v = min(1.0, max(0.0, v))
        return v * v * (3.0 - 2.0 * v)
    shoulder_x = 0.24 if KEY == 'hombrecaiman' else 0.20
    shoulder_z = 1.24 if KEY == 'hombrecaiman' else 1.34
    for obj in baked:
        if KEY == 'madremonte' and obj.name == 'pelo':
            continue
        inv = obj.matrix_world.inverted()
        for vert in obj.data.vertices:
            point = obj.matrix_world @ vert.co
            side = 1 if point.x >= 0 else -1
            reach = abs(point.x) - shoulder_x
            weight = smooth(reach / 0.18) * smooth((point.z - 0.83) / 0.25)
            if weight == 0:
                continue
            angle = math.radians((48 if KEY == 'hombrecaiman' else (56 if side > 0 else 44)) * side)
            pivot = Vector((side * shoulder_x, 0, shoulder_z))
            rotated = pivot + Matrix.Rotation(angle, 4, 'Y') @ (point - pivot)
            vert.co = inv @ point.lerp(rotated, weight)
        obj.data.update()
    bpy.context.view_layer.update()
    lo, hi = bounds(baked)
    print('AR_POSED_BOUNDS', KEY, list(lo), list(hi))

# Purge every source mesh, rig, camera, and controller from the export selection.
bpy.ops.object.select_all(action='DESELECT')
for o in baked:
    o.select_set(True)
bpy.context.view_layer.objects.active = baked[0]
os.makedirs(os.path.dirname(ASSET), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=ASSET, export_format='GLB', use_selection=True,
                          export_apply=True, export_animations=False, export_cameras=False,
                          export_lights=False, export_extras=False)
print('AR_EXPORTED', ASSET, os.path.getsize(ASSET))

# Compose a print-ready image target in Blender, keeping all card geometry out of GLB.
for o in list(bpy.data.objects):
    if o not in baked:
        bpy.data.objects.remove(o, do_unlink=True)

cream = material('Fondo verde profundo', (0.045, 0.085, 0.075))
accent = material('Acento de personaje', ACCENT, 0.65)
base = material('Peana negra', (0.07, 0.09, 0.075), 0.48, 0.1)

# A flat backdrop gives each figure a stable target without a card frame.
bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 1.85, 0.9), rotation=(math.pi/2, 0, 0))
back = bpy.context.object
back.name = 'Fondo de imagen objetivo'
back.scale = (5.0, 5.0, 1)
back.data.materials.append(cream)

bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.83, depth=0.07, location=(0, 0, -0.055))
bpy.context.object.name = 'Peana'
bpy.context.object.data.materials.append(base)
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.78, depth=0.008, location=(0, 0, -0.015))
bpy.context.object.name = 'Anillo de peana'
bpy.context.object.data.materials.append(accent)

world = bpy.data.worlds.new('Ambiente')
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes.get('Background').inputs['Color'].default_value = (0.13, 0.18, 0.16, 1)
world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 0.65

def light(loc, power, size):
    data = bpy.data.lights.new('Area', 'AREA')
    data.energy = power
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new('Luz de estudio', data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    direction = Vector((0, 0, 0.9)) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

light((-2.0, -3.0, 3.7), 600, 3.0)
light((2.0, 1.5, 3.0), 500, 2.0)

camdata = bpy.data.cameras.new('Camara ficha')
cam = bpy.data.objects.new('Camara ficha', camdata)
bpy.context.collection.objects.link(cam)
cam.location = (0, -6.0, 1.10) if KEY == 'madremonte' else (1.3, -6.0, 1.85)
target = Vector((0, 0, 0.70 if KEY == 'madremonte' else (0.72 if KEY in ('enemigo1', 'enemigo2') else 0.48)))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
camdata.type = 'ORTHO'
model_width = hi.x - lo.x
model_depth = hi.y - lo.y
model_height = hi.z - lo.z
camdata.ortho_scale = max(2.2, (model_width + (0 if KEY == 'madremonte' else model_depth * 0.22)) / 0.56, model_height / 0.76)
if KEY in ('enemigo1', 'enemigo2'):
    camdata.ortho_scale = max(camdata.ortho_scale, 2.60)
scene = bpy.context.scene
scene.camera = cam
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x = 768
scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = FIGURE
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
os.makedirs(os.path.dirname(FIGURE), exist_ok=True)
bpy.ops.render.render(write_still=True)
print('AR_RENDERED', FIGURE, os.path.getsize(FIGURE))
