"""
SpatialInk (Group 4 - Eau de Vision Pemula)
Blender 4.3 Asset Pipeline Script:
1. Optimizes, centers, aligns, and decimates the KIRI Engine photogrammetry scan
   into assets/scan_stylus.glb (and scan_fitted.glb).
2. Procedurally generates high-craft XR assets:
   - assets/gen_stylus.glb (and gen_fitted.glb): Ergonomic SpatialInk XR Stylus
   - assets/axis_guide.glb: "Axis" non-human floating line-and-orbit guide (Section 8)
   - assets/workbench_pedestal.glb: Holographic 3D vector workspace pedestal
   - assets/force_node.glb: Engineering mass/truss node for force exercises
"""

import bpy
import bmesh
import math
import os
import shutil
from mathutils import Vector, Matrix, Euler

REPO_DIR = "/Users/erwinqodariyah/Claude Project/Realx/ga3-webxr-demo"
ASSETS_DIR = os.path.join(REPO_DIR, "assets")
PREVIEW_DIR = "/Users/erwinqodariyah/.gemini/antigravity/brain/4a5c7da5-3cfb-48d1-92c6-545b5d010a29/scratch/asset_previews"
EXISTING_SCAN = os.path.join(REPO_DIR, "scan_fitted.glb")
KIRI_TEX = "/Users/erwinqodariyah/.gemini/antigravity/brain/4a5c7da5-3cfb-48d1-92c6-545b5d010a29/scratch/kiri_scan/3DModel.jpg"

os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_mat(name, base_color, metallic=0.0, roughness=0.4, emission_color=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission_color is not None and emission_strength > 0.0:
        bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def set_smooth(obj):
    if obj.type == 'MESH':
        for poly in obj.data.polygons:
            poly.use_smooth = True


def export_glb(filepath):
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_jpeg_quality=82,
    )
    size_kb = os.path.getsize(filepath) / 1024.0
    print(f"[EXPORT] {os.path.basename(filepath)} -> {size_kb:.1f} KB")


def render_preview(name, cam_offset=(0.25, -0.25, 0.16), target=(0, 0, 0)):
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 45
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = Vector(cam_offset)
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam

    key_data = bpy.data.lights.new("KeyLight", type='AREA')
    key_data.energy = 80
    key_data.size = 1.5
    key = bpy.data.objects.new("KeyLight", key_data)
    bpy.context.scene.collection.objects.link(key)
    key.location = Vector((1.2, -1.2, 1.5))
    key.rotation_euler = (Vector(target) - key.location).to_track_quat('-Z', 'Y').to_euler()

    rim_data = bpy.data.lights.new("RimLight", type='AREA')
    rim_data.energy = 45
    rim_data.color = (0.55, 0.82, 1.0)
    rim_data.size = 1.5
    rim = bpy.data.objects.new("RimLight", rim_data)
    bpy.context.scene.collection.objects.link(rim)
    rim.location = Vector((-1.2, 1.1, 0.8))
    rim.rotation_euler = (Vector(target) - rim.location).to_track_quat('-Z', 'Y').to_euler()

    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.04, 0.07, 0.13, 1.0)
    bg.inputs[1].default_value = 0.7

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.filepath = os.path.join(PREVIEW_DIR, f"{name}.png")
    bpy.ops.render.render(write_still=True)

    # Clean up preview camera/lights before export if needed
    for obj in [cam, key, rim]:
        bpy.data.objects.remove(obj, do_unlink=True)


# ---------------------------------------------------------
# 1. OPTIMIZE KIRI ENGINE SCANNED MARKER (scan_stylus.glb)
# ---------------------------------------------------------
def build_scan_stylus():
    clear_scene()
    # Backup original scan_fitted.glb in scratch if not backed up
    backup_path = os.path.join(PREVIEW_DIR, "orig_scan_fitted.glb")
    if not os.path.exists(backup_path):
        shutil.copy2(EXISTING_SCAN, backup_path)

    bpy.ops.import_scene.gltf(filepath=backup_path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    obj = meshes[0]
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Apply existing transforms
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Compute centroid and principal axis using simple power iteration on covariance
    verts = [v.co.copy() for v in obj.data.vertices]
    n = len(verts)
    centroid = sum(verts, Vector((0, 0, 0))) / n

    # Center vertices
    for v in obj.data.vertices:
        v.co -= centroid

    # Covariance matrix 3x3
    cov = Matrix(((0, 0, 0), (0, 0, 0), (0, 0, 0)))
    for v in obj.data.vertices:
        x, y, z = v.co.x, v.co.y, v.co.z
        cov[0][0] += x * x
        cov[0][1] += x * y
        cov[0][2] += x * z
        cov[1][0] += y * x
        cov[1][1] += y * y
        cov[1][2] += y * z
        cov[2][0] += z * x
        cov[2][1] += z * y
        cov[2][2] += z * z

    # Power iteration for dominant eigenvector (pen length axis)
    axis = Vector((1.0, 0.1, 0.05)).normalized()
    for _ in range(30):
        axis = (cov @ axis).normalized()

    # Rotate dominant axis to align with +Z (then tip towards -Z)
    rot_quat = axis.rotation_difference(Vector((0, 0, 1)))
    rot_mat = rot_quat.to_matrix().to_4x4()
    obj.data.transform(rot_mat)

    # Recompute bounds and scale so length along Z is exactly 0.165 m (16.5 cm marker)
    zs = [v.co.z for v in obj.data.vertices]
    length = max(zs) - min(zs)
    target_len = 0.165
    scale_f = target_len / max(length, 1e-5)
    obj.data.transform(Matrix.Scale(scale_f, 4))

    # Re-center bounding box cleanly at origin
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    cx = (min(xs) + max(xs)) * 0.5
    cy = (min(ys) + max(ys)) * 0.5
    cz = (min(zs) + max(zs)) * 0.5
    obj.data.transform(Matrix.Translation(Vector((-cx, -cy, -cz))))
    obj.data.update()

    # Decimate cleanly from ~64k faces to ~7k faces for fast WebXR Quest performance
    dec = obj.modifiers.new(name="Decimate", type='DECIMATE')
    dec.ratio = 0.11
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="Decimate")
    set_smooth(obj)

    # Resize packed texture to 1024x1024 for fast mobile/Quest load & clean PBR roughness
    for img in bpy.data.images:
        if img.size[0] > 1024 or img.size[1] > 1024:
            img.scale(1024, 1024)
            img.pack()

    for mat in obj.data.materials:
        if mat and mat.use_nodes:
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Roughness"].default_value = 0.55
                bsdf.inputs["Metallic"].default_value = 0.05

    obj.name = "KIRI_Scanned_Marker"
    print(f"[SCAN] Final verts={len(obj.data.vertices)}, faces={len(obj.data.polygons)}, dim={tuple(round(d,4) for d in obj.dimensions)}")

    out_path = os.path.join(ASSETS_DIR, "scan_stylus.glb")
    export_glb(out_path)
    shutil.copy2(out_path, EXISTING_SCAN)
    render_preview("scan_stylus", cam_offset=(0.14, -0.14, 0.08), target=(0, 0, 0))


# ---------------------------------------------------------
# 2. GENERATE SPATIALINK XR STYLUS (gen_stylus.glb)
# ---------------------------------------------------------
def build_gen_stylus():
    clear_scene()
    m_body = make_pbr_mat("StylusBody", (0.86, 0.90, 0.95), metallic=0.25, roughness=0.28)
    m_grip = make_pbr_mat("StylusGrip", (0.10, 0.13, 0.18), metallic=0.1, roughness=0.72)
    m_metal = make_pbr_mat("StylusMetal", (0.62, 0.68, 0.76), metallic=0.88, roughness=0.22)
    m_glow = make_pbr_mat("StylusGlow", (0.22, 0.75, 0.98), metallic=0.1, roughness=0.15,
                          emission_color=(0.22, 0.75, 0.98), emission_strength=3.5)
    m_tip = make_pbr_mat("StylusTip", (0.35, 0.88, 1.0), metallic=0.2, roughness=0.15,
                         emission_color=(0.22, 0.82, 1.0), emission_strength=4.5)

    # Stylus aligned along Z: tip at z = -0.0825, back cap at z = +0.0825 (total 16.5 cm)
    parts = []

    # Main upper barrel (z: -0.015 to +0.068)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.0072, depth=0.083, location=(0, 0, 0.0265))
    o = bpy.context.active_object
    o.name = "MainBarrel"
    o.data.materials.append(m_body)
    set_smooth(o)
    parts.append(o)

    # Back titanium end cap (z: +0.068 to +0.080)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.0070, depth=0.012, location=(0, 0, 0.074))
    o = bpy.context.active_object
    o.name = "EndCap"
    o.data.materials.append(m_metal)
    set_smooth(o)
    parts.append(o)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.0070, location=(0, 0, 0.079))
    o = bpy.context.active_object
    o.scale = (1, 1, 0.45)
    o.name = "EndCapDome"
    o.data.materials.append(m_metal)
    set_smooth(o)
    parts.append(o)

    # Glowing LED status collar ring (z: -0.0175)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.00755, depth=0.005, location=(0, 0, -0.0175))
    o = bpy.context.active_object
    o.name = "StatusGlowRing"
    o.data.materials.append(m_glow)
    set_smooth(o)
    parts.append(o)

    # Ergonomic matte grip section (z: -0.055 to -0.020)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.0075, depth=0.035, location=(0, 0, -0.0375))
    o = bpy.context.active_object
    o.name = "ErgonomicGrip"
    o.data.materials.append(m_grip)
    set_smooth(o)
    parts.append(o)

    # Subtle accent rings on grip
    for gz in (-0.028, -0.038, -0.048):
        bpy.ops.mesh.primitive_torus_add(
            major_segments=32, minor_segments=12,
            major_radius=0.00755, minor_radius=0.00045,
            location=(0, 0, gz)
        )
        o = bpy.context.active_object
        o.data.materials.append(m_metal)
        set_smooth(o)
        parts.append(o)

    # Side trigger button on grip
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0072, 0, -0.034))
    o = bpy.context.active_object
    o.scale = (0.0022, 0.0032, 0.014)
    o.name = "ActionButton"
    o.data.materials.append(m_glow)
    parts.append(o)

    # Tapered metallic nose cone (z: -0.075 to -0.055)
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.0074, radius2=0.0024, depth=0.020, location=(0, 0, -0.065), rotation=(math.pi, 0, 0))
    o = bpy.context.active_object
    o.name = "TaperCone"
    o.data.materials.append(m_metal)
    set_smooth(o)
    parts.append(o)

    # Glowing precision emitter tip (z: -0.0825 to -0.075)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.0023, radius2=0.0008, depth=0.0075, location=(0, 0, -0.07875), rotation=(math.pi, 0, 0))
    o = bpy.context.active_object
    o.name = "PrecisionNib"
    o.data.materials.append(m_tip)
    set_smooth(o)
    parts.append(o)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.0011, location=(0, 0, -0.0825))
    o = bpy.context.active_object
    o.name = "NibBall"
    o.data.materials.append(m_tip)
    set_smooth(o)
    parts.append(o)

    out_path = os.path.join(ASSETS_DIR, "gen_stylus.glb")
    export_glb(out_path)
    shutil.copy2(out_path, os.path.join(REPO_DIR, "gen_fitted.glb"))
    render_preview("gen_stylus", cam_offset=(0.14, -0.14, 0.08), target=(0, 0, 0))


# ---------------------------------------------------------
# 3. GENERATE "AXIS" FLOATING LINE-AND-ORBIT GUIDE (Section 8)
# ---------------------------------------------------------
def build_axis_guide():
    clear_scene()
    m_core = make_pbr_mat("AxisCore", (0.22, 0.78, 1.0), metallic=0.15, roughness=0.12,
                          emission_color=(0.18, 0.72, 1.0), emission_strength=3.2)
    m_shell = make_pbr_mat("AxisShell", (0.12, 0.17, 0.28), metallic=0.85, roughness=0.22)
    m_ring_x = make_pbr_mat("AxisRingX", (0.97, 0.44, 0.44), metallic=0.6, roughness=0.25,
                            emission_color=(0.97, 0.44, 0.44), emission_strength=1.4)
    m_ring_y = make_pbr_mat("AxisRingY", (0.20, 0.83, 0.60), metallic=0.6, roughness=0.25,
                            emission_color=(0.20, 0.83, 0.60), emission_strength=1.4)
    m_ring_z = make_pbr_mat("AxisRingZ", (0.22, 0.74, 0.97), metallic=0.6, roughness=0.25,
                            emission_color=(0.22, 0.74, 0.97), emission_strength=1.8)

    # Central faceted glowing octahedron core
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.055, location=(0, 0, 0))
    core = bpy.context.active_object
    core.name = "Axis_Core"
    core.data.materials.append(m_core)

    # Outer wireframe-style equatorial cage ring
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=12, major_radius=0.082, minor_radius=0.0045)
    eq = bpy.context.active_object
    eq.name = "Axis_Equator"
    eq.data.materials.append(m_shell)
    set_smooth(eq)

    # Three tilted orbital rings representing X, Y, Z spatial axes
    ring_specs = [
        ("Orbit_X", 0.115, 0.0032, (math.radians(65), math.radians(15), 0), m_ring_x),
        ("Orbit_Y", 0.132, 0.0032, (math.radians(-50), math.radians(45), math.radians(20)), m_ring_y),
        ("Orbit_Z", 0.150, 0.0035, (math.radians(22), math.radians(-62), math.radians(-15)), m_ring_z),
    ]
    for rname, maj_r, min_r, rot, mat in ring_specs:
        bpy.ops.mesh.primitive_torus_add(
            major_segments=64, minor_segments=12,
            major_radius=maj_r, minor_radius=min_r,
            rotation=rot
        )
        r = bpy.context.active_object
        r.name = rname
        r.data.materials.append(mat)
        set_smooth(r)

    # 6 cardinal precision axis ticks (line-and-orbit motif)
    tick_dirs = [
        ((0.175, 0, 0), (0, math.pi / 2, 0), m_ring_x),
        ((-0.175, 0, 0), (0, math.pi / 2, 0), m_ring_x),
        ((0, 0.175, 0), (math.pi / 2, 0, 0), m_ring_y),
        ((0, -0.175, 0), (math.pi / 2, 0, 0), m_ring_y),
        ((0, 0, 0.175), (0, 0, 0), m_ring_z),
        ((0, 0, -0.175), (0, 0, 0), m_ring_z),
    ]
    for i, (loc, rot, mat) in enumerate(tick_dirs):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.0035, depth=0.026, location=loc, rotation=rot)
        t = bpy.context.active_object
        t.name = f"Axis_Tick_{i}"
        t.data.materials.append(mat)
        set_smooth(t)

    out_path = os.path.join(ASSETS_DIR, "axis_guide.glb")
    export_glb(out_path)
    render_preview("axis_guide", cam_offset=(0.35, -0.35, 0.22), target=(0, 0, 0))


# ---------------------------------------------------------
# 4. GENERATE HOLOGRAPHIC WORKBENCH PEDESTAL (workbench_pedestal.glb)
# ---------------------------------------------------------
def build_workbench_pedestal():
    clear_scene()
    m_dark = make_pbr_mat("PedestalSlate", (0.07, 0.09, 0.14), metallic=0.65, roughness=0.38)
    m_trim = make_pbr_mat("PedestalTrim", (0.24, 0.30, 0.40), metallic=0.85, roughness=0.26)
    m_glass = make_pbr_mat("PedestalGlass", (0.04, 0.08, 0.14), metallic=0.15, roughness=0.12)
    m_glow = make_pbr_mat("PedestalGlow", (0.18, 0.72, 0.98), metallic=0.1, roughness=0.2,
                          emission_color=(0.18, 0.72, 0.98), emission_strength=2.6)

    # Lower octagonal base (radius 0.85m, height 0.08m, top at y=0 in glTF -> z=0 in Blender)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.82, depth=0.06, location=(0, 0, -0.05), rotation=(0, 0, math.pi / 8))
    base = bpy.context.active_object
    base.name = "BaseOctagon"
    base.data.materials.append(m_dark)

    # Upper beveled deck plate
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.74, depth=0.024, location=(0, 0, -0.012), rotation=(0, 0, math.pi / 8))
    deck = bpy.context.active_object
    deck.name = "TopDeck"
    deck.data.materials.append(m_glass)

    # Glowing perimeter ring
    bpy.ops.mesh.primitive_torus_add(major_segments=64, minor_segments=12, major_radius=0.66, minor_radius=0.006, location=(0, 0, -0.002))
    ring = bpy.context.active_object
    ring.name = "HoloRing"
    ring.data.materials.append(m_glow)
    set_smooth(ring)

    # Inner origin compass ring
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=10, major_radius=0.14, minor_radius=0.004, location=(0, 0, 0.001))
    inner = bpy.context.active_object
    inner.name = "OriginRing"
    inner.data.materials.append(m_trim)
    set_smooth(inner)

    # 4 Corner Holographic Emitter Pods
    for i in range(4):
        ang = math.radians(45 + i * 90)
        r = 0.70
        x, y = r * math.cos(ang), r * math.sin(ang)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, y, 0.015), rotation=(0, 0, ang))
        pod = bpy.context.active_object
        pod.scale = (0.09, 0.055, 0.032)
        pod.name = f"EmitterPod_{i}"
        pod.data.materials.append(m_trim)

        # Glowing emitter lens facing inward
        lx, ly = (r - 0.042) * math.cos(ang), (r - 0.042) * math.sin(ang)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.012, depth=0.012, location=(lx, ly, 0.022),
                                            rotation=(0, math.radians(65), ang))
        lens = bpy.context.active_object
        lens.name = f"EmitterLens_{i}"
        lens.data.materials.append(m_glow)
        set_smooth(lens)

    # Central support column extending down to floor (z: -0.08 to -0.82)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.16, depth=0.74, location=(0, 0, -0.45), rotation=(0, 0, math.pi / 8))
    col = bpy.context.active_object
    col.name = "SupportColumn"
    col.data.materials.append(m_dark)

    # Floor anchor foot
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.42, depth=0.04, location=(0, 0, -0.82), rotation=(0, 0, math.pi / 8))
    foot = bpy.context.active_object
    foot.name = "FloorFoot"
    foot.data.materials.append(m_trim)

    out_path = os.path.join(ASSETS_DIR, "workbench_pedestal.glb")
    export_glb(out_path)
    render_preview("workbench_pedestal", cam_offset=(1.6, -1.6, 1.0), target=(0, 0, -0.35))


# ---------------------------------------------------------
# 5. GENERATE ENGINEERING FORCE NODE (force_node.glb)
# ---------------------------------------------------------
def build_force_node():
    clear_scene()
    m_alloy = make_pbr_mat("NodeAlloy", (0.48, 0.56, 0.66), metallic=0.85, roughness=0.25)
    m_core = make_pbr_mat("NodeDark", (0.10, 0.14, 0.22), metallic=0.5, roughness=0.4)
    m_glow = make_pbr_mat("NodeGlow", (0.98, 0.75, 0.15), metallic=0.1, roughness=0.2,
                          emission_color=(0.98, 0.75, 0.15), emission_strength=2.5)

    # Chamfered main test mass cube (0.09 m)
    bpy.ops.mesh.primitive_cube_add(size=0.082, location=(0, 0, 0))
    cube = bpy.context.active_object
    cube.name = "ForceBlock"
    bev = cube.modifiers.new(name="Bevel", type='BEVEL')
    bev.width = 0.010
    bev.segments = 3
    bpy.ops.object.modifier_apply(modifier="Bevel")
    cube.data.materials.append(m_alloy)
    set_smooth(cube)

    # 6 Anchor ports on +-X, +-Y, +-Z
    ports = [
        ((0.042, 0, 0), (0, math.pi / 2, 0)),
        ((-0.042, 0, 0), (0, math.pi / 2, 0)),
        ((0, 0.042, 0), (math.pi / 2, 0, 0)),
        ((0, -0.042, 0), (math.pi / 2, 0, 0)),
        ((0, 0, 0.042), (0, 0, 0)),
        ((0, 0, -0.042), (0, 0, 0)),
    ]
    for i, (loc, rot) in enumerate(ports):
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.016, depth=0.008, location=loc, rotation=rot)
        p = bpy.context.active_object
        p.name = f"AnchorPort_{i}"
        p.data.materials.append(m_core)
        set_smooth(p)

        bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=8, major_radius=0.015, minor_radius=0.0022, location=loc, rotation=rot)
        g = bpy.context.active_object
        g.name = f"AnchorRing_{i}"
        g.data.materials.append(m_glow)
        set_smooth(g)

    out_path = os.path.join(ASSETS_DIR, "force_node.glb")
    export_glb(out_path)
    render_preview("force_node", cam_offset=(0.18, -0.18, 0.13), target=(0, 0, 0))


if __name__ == "__main__":
    build_scan_stylus()
    build_gen_stylus()
    build_axis_guide()
    build_workbench_pedestal()
    build_force_node()
    print("ALL 5 ASSETS BUILT SUCCESSFULLY!")
