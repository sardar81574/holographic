
import "./style.css";

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ARButton } from "three/addons/webxr/ARButton.js";

const viewport = document.querySelector("#viewport");
const status = document.querySelector("#status");
const message = document.querySelector("#message");
const assetFile = document.querySelector("#assetFile");
const arBtn = document.querySelector("#arBtn");
const resetBtn = document.querySelector("#resetBtn");
const scaleSlider = document.querySelector("#scaleSlider");
const scaleValue = document.querySelector("#scaleValue");
const rotationSlider = document.querySelector("#rotationSlider");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#080f1d");

const camera = new THREE.PerspectiveCamera(
  45,
  viewport.clientWidth / viewport.clientHeight,
  0.01,
  100
);

camera.position.set(0, 1.6, 4.5);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.8, 0);

scene.add(new THREE.HemisphereLight(0xbdeaff, 0x243047, 2));

const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(3, 5, 4);
scene.add(light);

const floorGrid = new THREE.GridHelper(10, 30, 0x3fcbff, 0x263a55);
floorGrid.position.y = 0;
scene.add(floorGrid);

const platform = new THREE.Mesh(
  new THREE.CircleGeometry(1.2, 64),
  new THREE.MeshBasicMaterial({
    color: 0x164c69,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide
  })
);

platform.rotation.x = -Math.PI / 2;
platform.position.y = 0.01;
scene.add(platform);

let activeObject = null;
let mixer = null;
let clock = new THREE.Clock();
let hitTestSource = null;
let hitTestRequested = false;
let reticle = null;
let placedInAR = false;
let currentObjectScale = 1;
let currentObjectUrl = null;
let loadVersion = 0;

const gltfLoader = new GLTFLoader();

function setMessage(text) {
  message.textContent = text;
}

function clearObject() {
  loadVersion++;

  if (activeObject) {
    scene.remove(activeObject);

    activeObject.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();

        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
  }

  activeObject = null;
  mixer = null;

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

function fitObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const largest = Math.max(size.x, size.y, size.z);

  if (largest > 0) {
    const scale = 1.7 / largest;
    object.scale.multiplyScalar(scale);
  }

  const fittedBox = new THREE.Box3().setFromObject(object);
  const fittedCenter = fittedBox.getCenter(new THREE.Vector3());

  object.position.x -= fittedCenter.x;
  object.position.y -= fittedBox.min.y;
  object.position.z -= fittedCenter.z;

  currentObjectScale = 1;
  scaleSlider.value = "1";
  scaleValue.textContent = "1.0×";
}

function showObject(object, animationClips = []) {
  clearObject();

  activeObject = object;
  scene.add(activeObject);
  fitObject(activeObject);

  if (animationClips.length > 0) {
    mixer = new THREE.AnimationMixer(activeObject);

    animationClips.forEach((clip) => {
      mixer.clipAction(clip).play();
    });
  }

  placedInAR = false;
  activeObject.visible = true;

  controls.target.set(0, 0.8, 0);
  controls.update();

  setMessage(
    animationClips.length
      ? `3D model loaded with ${animationClips.length} animation(s).`
      : "Object loaded. Drag to rotate and use the size slider."
  );
  status.textContent = "3D READY";
}

function createImageObject(file) {
  const version = loadVersion + 1;
  clearObject();
  const expectedVersion = loadVersion;

  const url = URL.createObjectURL(file);
  currentObjectUrl = url;

  const textureLoader = new THREE.TextureLoader();

  textureLoader.load(
    url,
    (texture) => {
      if (expectedVersion !== loadVersion) {
        texture.dispose();
        URL.revokeObjectURL(url);
        return;
      }

      texture.colorSpace = THREE.SRGBColorSpace;

      const image = texture.image;
      const aspect = image.width / image.height;
      const height = 1.7;
      const width = Math.min(height * aspect, 2.5);

      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
      });

      const plane = new THREE.Mesh(geometry, material);
      plane.position.y = height / 2;

      showObject(plane);
      setMessage(
        "Image displayed in 3D space. This is a flat image, not a reconstructed 3D person or animal."
      );
    },
    undefined,
    () => {
      if (expectedVersion === loadVersion) {
        setMessage("Image could not be loaded. Try another image.");
        status.textContent = "LOAD ERROR";
      }

      URL.revokeObjectURL(url);

      if (currentObjectUrl === url) {
        currentObjectUrl = null;
      }
    }
  );
}

function createDemoObject() {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x36d9ff,
    metalness: 0.45,
    roughness: 0.25,
    emissive: 0x073b50
  });

  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x182943,
    metalness: 0.6,
    roughness: 0.3
  });

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.65, 5, 12),
    bodyMaterial
  );
  body.position.y = 1.05;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 24, 24),
    bodyMaterial
  );
  head.position.y = 1.65;
  group.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.08, 0.38),
    darkMaterial
  );
  visor.position.set(0, 1.68, 0.19);
  group.add(visor);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.43, 4, 8),
      darkMaterial
    );
    arm.position.set(side * 0.4, 1.12, 0);
    arm.rotation.z = side * -0.2;
    group.add(arm);

    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 0.42, 4, 8),
      bodyMaterial
    );
    leg.position.set(side * 0.15, 0.38, 0);
    group.add(leg);
  }

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.015, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x68e6ff })
  );
  halo.position.y = 2.05;
  halo.rotation.x = Math.PI / 2;
  group.add(halo);

  const animation = {
    update(delta, elapsed) {
      group.rotation.y = Math.sin(elapsed * 0.7) * 0.18;
      head.position.y = 1.65 + Math.sin(elapsed * 2) * 0.025;
    }
  };

  showObject(group);
  setMessage("Demo mannequin loaded. Upload a GLB model for realistic animation.");

  return animation;
}

assetFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const name = file.name.toLowerCase();

  if (file.type.startsWith("image/")) {
    createImageObject(file);
    return;
  }

  if (name.endsWith(".glb") || name.endsWith(".gltf")) {
    const version = loadVersion + 1;
    clearObject();
    const expectedVersion = loadVersion;

    const url = URL.createObjectURL(file);
    currentObjectUrl = url;

    setMessage("Loading 3D model...");

    gltfLoader.load(
      url,
      (gltf) => {
        if (expectedVersion !== loadVersion) {
          return;
        }

        currentObjectUrl = null;
        URL.revokeObjectURL(url);

        showObject(gltf.scene, gltf.animations);
      },
      undefined,
      (error) => {
        console.error(error);

        if (expectedVersion === loadVersion) {
          setMessage(
            "Could not load this model. A GLB file is usually easiest. A GLTF file may require its external texture and binary files."
          );
          status.textContent = "LOAD ERROR";
        }

        URL.revokeObjectURL(url);

        if (currentObjectUrl === url) {
          currentObjectUrl = null;
        }
      }
    );

    return;
  }

  setMessage("Please choose an image, .glb or .gltf file.");
});

scaleSlider.addEventListener("input", () => {
  currentObjectScale = Number(scaleSlider.value);
  scaleValue.textContent = `${currentObjectScale.toFixed(1)}×`;

  if (activeObject) {
    activeObject.scale.setScalar(
      activeObject.userData.baseScale * currentObjectScale || currentObjectScale
    );
  }
});

rotationSlider.addEventListener("input", () => {
  if (activeObject) {
    activeObject.rotation.y =
      (Number(rotationSlider.value) * Math.PI) / 180;
  }
});

resetBtn.addEventListener("click", () => {
  camera.position.set(0, 1.6, 4.5);
  controls.target.set(0, 0.8, 0);
  controls.update();

  rotationSlider.value = "0";
  scaleSlider.value = "1";
  scaleValue.textContent = "1.0×";

  if (activeObject) {
    activeObject.rotation.y = 0;
    currentObjectScale = 1;
    fitObject(activeObject);
  }

  setMessage("View reset.");
});

function onResize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  if (!width || !height) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener("resize", onResize);

const reticleGeometry = new THREE.RingGeometry(0.12, 0.16, 32);
const reticleMaterial = new THREE.MeshBasicMaterial({
  color: 0x68e6ff
});

reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
reticle.rotation.x = -Math.PI / 2;
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

arBtn.addEventListener("click", () => {
  setMessage("If supported, allow camera access and point at a floor or table.");
});

renderer.xr.addEventListener("sessionstart", async () => {
  status.textContent = "AR ACTIVE";
  controls.enabled = false;
  hitTestRequested = false;
  hitTestSource = null;
  placedInAR = false;

  scene.background = null;
  floorGrid.visible = false;
  platform.visible = false;

  const session = renderer.xr.getSession();

  try {
    if (session.requestHitTestSource) {
      const referenceSpace = await session.requestReferenceSpace("viewer");
      hitTestSource = await session.requestHitTestSource({
        space: referenceSpace
      });
      hitTestRequested = true;
    }
  } catch (error) {
    console.warn("Hit-test unavailable:", error);
    setMessage("AR started, but surface detection is unavailable.");
  }

  setMessage("Point at a floor or table. Tap to place your object.");
});

renderer.xr.addEventListener("sessionend", () => {
  status.textContent = "3D READY";
  controls.enabled = true;

  scene.background = new THREE.Color("#080f1d");
  floorGrid.visible = true;
  platform.visible = true;
  reticle.visible = false;
  hitTestSource = null;
  hitTestRequested = false;
  placedInAR = false;

  if (activeObject) {
    activeObject.position.set(0, 0, 0);
    activeObject.visible = true;
  }

  setMessage("AR ended. Your 3D preview is ready.");
});

const arButton = ARButton.createButton(renderer, {
  requiredFeatures: ["hit-test"]
});

arButton.style.display = "none";
document.body.appendChild(arButton);

arBtn.addEventListener("click", () => {
  arButton.click();
});

renderer.domElement.addEventListener("click", () => {
  if (!renderer.xr.isPresenting || !reticle.visible || !activeObject) {
    return;
  }

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  reticle.matrix.decompose(position, quaternion, scale);

  activeObject.position.copy(position);
  activeObject.quaternion.copy(quaternion);
  activeObject.visible = true;
  placedInAR = true;

  setMessage("Object placed in your real-world view.");
});

function animate() {
  const delta = clock.getDelta();

  if (mixer) {
    mixer.update(delta);
  }

  if (renderer.xr.isPresenting) {
    const frame = renderer.xr.getFrame();

    if (frame && hitTestSource && !placedInAR) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(hitTestSource);

      if (hits.length > 0) {
        const pose = hits[0].getPose(referenceSpace);

        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }
  } else {
    controls.update();
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

createDemoObject();
