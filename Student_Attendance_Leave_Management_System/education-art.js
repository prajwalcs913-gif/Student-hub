"use strict";

window.initEducationArt = function initEducationArt(stageId = "educationArt", canvasId = "educationArtCanvas") {
  const stage = document.getElementById(stageId);
  const canvas = document.getElementById(canvasId);
  const THREE = window.THREE;
  if (!stage || !canvas || !THREE) return;

  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(5.8, 5.2, 8.4);
    camera.lookAt(0, 1.55, 0);

    const artwork = new THREE.Group();
    const materials = {
      pedestal: new THREE.MeshPhysicalMaterial({ color: 0x1265d8, metalness: 0.72, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x91e8ff, metalness: 0.78, roughness: 0.18 }),
      pages: new THREE.MeshStandardMaterial({ color: 0xf7fcff, roughness: 0.56 }),
      coverBlue: new THREE.MeshPhysicalMaterial({ color: 0x1769ff, metalness: 0.34, roughness: 0.28, clearcoat: 0.82, clearcoatRoughness: 0.2 }),
      coverNavy: new THREE.MeshPhysicalMaterial({ color: 0x103b88, metalness: 0.42, roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.18 }),
      coverCyan: new THREE.MeshPhysicalMaterial({ color: 0x23b9e8, metalness: 0.32, roughness: 0.26, clearcoat: 0.9, clearcoatRoughness: 0.18 }),
      capWhite: new THREE.MeshPhysicalMaterial({ color: 0xf8fdff, metalness: 0.28, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 }),
      capBlue: new THREE.MeshPhysicalMaterial({ color: 0x1769ff, metalness: 0.48, roughness: 0.19, clearcoat: 1, clearcoatRoughness: 0.1 }),
      tassel: new THREE.MeshStandardMaterial({ color: 0x9beaff, metalness: 0.55, roughness: 0.22 })
    };

    const roundedShape = (width, height, radius) => {
      const left = -width / 2;
      const right = width / 2;
      const bottom = -height / 2;
      const top = height / 2;
      const shape = new THREE.Shape();
      shape.moveTo(left + radius, bottom);
      shape.lineTo(right - radius, bottom);
      shape.quadraticCurveTo(right, bottom, right, bottom + radius);
      shape.lineTo(right, top - radius);
      shape.quadraticCurveTo(right, top, right - radius, top);
      shape.lineTo(left + radius, top);
      shape.quadraticCurveTo(left, top, left, top - radius);
      shape.lineTo(left, bottom + radius);
      shape.quadraticCurveTo(left, bottom, left + radius, bottom);
      return shape;
    };

    const roundedBlock = (width, height, depth, radius, material, bevel = 0.035) => {
      const geometry = new THREE.ExtrudeGeometry(roundedShape(width, height, radius), {
        depth,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: bevel,
        bevelThickness: bevel
      });
      geometry.translate(0, 0, -depth / 2);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    const pedestal = roundedBlock(3.3, 0.54, 2.25, 0.2, materials.pedestal, 0.055);
    pedestal.position.y = 0.34;
    artwork.add(pedestal);
    const pedestalTrim = roundedBlock(3.25, 0.045, 2.2, 0.12, materials.trim, 0.012);
    pedestalTrim.position.y = 0.59;
    artwork.add(pedestalTrim);

    const createBook = (coverMaterial, y, rotation) => {
      const book = new THREE.Group();
      const pageBlock = roundedBlock(2.55, 0.32, 1.82, 0.09, materials.pages, 0.025);
      pageBlock.position.y = 0.19;
      const bottomCover = roundedBlock(2.68, 0.065, 1.94, 0.1, coverMaterial, 0.02);
      bottomCover.position.y = 0.035;
      const topCover = roundedBlock(2.68, 0.07, 1.94, 0.1, coverMaterial, 0.022);
      topCover.position.y = 0.36;
      const spine = roundedBlock(0.12, 0.39, 1.98, 0.05, coverMaterial, 0.018);
      spine.position.set(-1.31, 0.2, 0);
      book.add(pageBlock, bottomCover, topCover, spine);

      for (let line = 0; line < 4; line += 1) {
        const pageLine = new THREE.Mesh(
          new THREE.BoxGeometry(1.95, 0.008, 0.008),
          new THREE.MeshStandardMaterial({ color: line % 2 ? 0xc5d8e8 : 0xffffff, roughness: 0.7 })
        );
        pageLine.position.set(0.03, 0.13 + line * 0.035, 0.925);
        book.add(pageLine);
      }

      book.position.y = y;
      book.rotation.y = rotation;
      artwork.add(book);
    };

    createBook(materials.coverNavy, 0.63, -0.045);
    createBook(materials.coverCyan, 1.04, 0.04);
    createBook(materials.coverBlue, 1.45, -0.025);

    const capBase = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.7, 0.28, 40), materials.capWhite);
    capBase.position.set(0, 1.93, 0.02);
    capBase.castShadow = true;
    capBase.receiveShadow = true;
    artwork.add(capBase);

    const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.65, 0.14, 40), materials.capBlue);
    capBand.position.set(0, 1.9, 0.02);
    capBand.castShadow = true;
    artwork.add(capBand);

    const boardShape = new THREE.Shape();
    boardShape.moveTo(-1.18, 0);
    boardShape.lineTo(0, 0.3);
    boardShape.lineTo(1.18, 0);
    boardShape.lineTo(0, -0.3);
    boardShape.closePath();
    const board = new THREE.Mesh(
      new THREE.ExtrudeGeometry(boardShape, { depth: 0.12, bevelEnabled: true, bevelSegments: 5, bevelSize: 0.045, bevelThickness: 0.045 }),
      materials.capBlue
    );
    board.position.set(0, 2.14, 0.02);
    board.castShadow = true;
    board.receiveShadow = true;
    artwork.add(board);

    const boardAccent = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.025, 0.04), materials.capWhite);
    boardAccent.position.set(-0.04, 2.19, 0.09);
    boardAccent.rotation.z = -0.13;
    artwork.add(boardAccent);

    const tasselPath = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.92, 2.28, 0.13),
      new THREE.Vector3(1.16, 2.05, 0.2),
      new THREE.Vector3(1.11, 1.86, 0.23)
    ]);
    const tasselLine = new THREE.Line(tasselPath, new THREE.LineBasicMaterial({ color: 0x9beaff, linewidth: 2 }));
    const tasselTip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), materials.tassel);
    tasselTip.position.set(1.11, 1.84, 0.23);
    artwork.add(tasselLine, tasselTip);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: 0x03183d, opacity: 0.3 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.04;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    scene.add(artwork);

    scene.add(new THREE.HemisphereLight(0xdff8ff, 0x082350, 1.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(-4, 7, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x70dbff, 1.8);
    rimLight.position.set(5, 3, -4);
    scene.add(rimLight);
    const frontFill = new THREE.DirectionalLight(0xffffff, 0.8);
    frontFill.position.set(2, 2, 6);
    scene.add(frontFill);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);

    const resize = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    new ResizeObserver(resize).observe(stage);
    stage.classList.add("is-rendered");

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const render = time => {
      artwork.rotation.y = reducedMotion ? -0.12 : Math.sin(time * 0.00022) * 0.1;
      artwork.position.y = reducedMotion ? 0 : Math.sin(time * 0.0009) * 0.025;
      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      render(0);
    } else {
      const animate = time => {
        if (!document.hidden) render(time);
        window.requestAnimationFrame(animate);
      };
      window.requestAnimationFrame(animate);
    }
  } catch (error) {
    console.warn("The 3D education illustration could not be rendered; using the static fallback.", error);
  }
};