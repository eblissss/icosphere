// Icosphere Simulator
// Ethan Bliss
// September 2021

// Allows the user to interact with and view an icosphere

// Config
// On start:
let subdivisions = 2;
let scale = 1.0;
let velX = 40.0;
let velY = 20.0;
// Constant variables:
const resist = 0.02;
const lightCol = [1, 1, 1];
const lightPos = [3, 1, 1];
const cullFace = "back";

// Unpack gl-matrix types
const { mat4, vec3 } = glMatrix;

// Get gl context
const canvas = document.querySelector("#glCanvas");
const gl = canvas.getContext("webgl2");

main();
// Main
function main() {
  // Check for gl
  if (!gl) {
    alert("Unable to init WebGL");
    return;
  }

  // Vertex Source
  const vertexSource = `#version 300 es

    uniform mat4 model;
    uniform mat4 view;
    uniform mat4 proj;
    uniform mediump vec3 lightColor;
    uniform mediump vec3 lightPos;
    uniform mediump float scale;
    uniform mediump vec3 icoColor;
    uniform lowp int defaultColor;

    in vec3 vertexPos;

    flat out vec3 vColor;
    flat out vec3 vNormal;
    out vec3 vCurPos;
    out vec3 vLightColor;
    out vec3 vLightPos;

    void main(void) {
      // Send varyings to frag
      vLightColor = lightColor;
      vLightPos = scale * lightPos;

      // Apply model matrix to position
      vCurPos = vec3(scale * model * vec4(vertexPos, 1.0));
      
      // Vertex normals are their positions for a sphere around origin
      vNormal = vCurPos;

      // Choose rainbow or picker
      if (defaultColor == 1) {
        vColor = vertexPos + vec3(0.15, 0.15, 0.15);
      } else {
        vColor = icoColor;
      }

      // Apply matrices for final positions
      gl_Position = proj * view * vec4(vCurPos, 1.0);
    }
    `;

  // Fragment Source
  const fragSource = `#version 300 es

    in mediump vec3 vLightColor;
    in mediump vec3 vLightPos;
    flat in mediump vec3 vColor;
    flat in mediump vec3 vNormal;
    in mediump vec3 vCurPos;

    out highp vec4 fragColor;

    // Light from a point
    highp vec4 pointLight(vec3 lightPos) {
      mediump vec3 camPos = vec3(0.0, 0.0, 5.0);

      // Calculate variables
      mediump vec3 lightVec = lightPos - vCurPos;
      mediump vec3 lightDir = normalize(lightVec);
      mediump vec3 normal = normalize(vNormal);
      mediump float dist = length(lightVec);
      mediump float intst = 1.0 / (0.4 * dist * dist + 0.2 * dist + 1.0);

      // Ambient
      mediump float ambient = 0.2;

      // Diffuse
      mediump float diffuse = max(dot(normal, lightDir), 0.0);

      // Specular
      mediump vec3 viewDir = normalize(camPos - vCurPos);
      mediump vec3 reflcDir = reflect(-lightDir, normal);
      mediump float specular = pow(max(dot(viewDir, reflcDir), 0.0), 32.0);

      // Calculate final (ambient optional when using other lighting)
      highp vec3 res = vColor * vLightColor * ((diffuse + specular) * intst); // + ambient);
      return vec4(res, 1.0);
    }

    // Directional Light (e.g. sun)
    highp vec4 direcLight(vec3 lightPos) {
      mediump vec3 lightDir = normalize(lightPos);
      mediump vec3 normal = normalize(vNormal);

      mediump float ambient = 0.3;
      
      mediump float direc = max(dot(normal, lightDir), 0.0) / 2.0;
      
      return vec4(vColor * vLightColor * (direc + ambient), 1.0);
    }

    void main(void) {
      // Calculate from all light sources
      fragColor = (direcLight(-vLightPos) 
                 + direcLight(vec3(0.0, 2.0, 5.0)) 
                 + pointLight(vLightPos)) / 1.5;
    }
    `;

  shaderProgram = createShaderProgram(vertexSource, fragSource);

  // Collect program info
  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPos: gl.getAttribLocation(shaderProgram, "vertexPos"),
    },
    uniformLocations: {
      projMat: gl.getUniformLocation(shaderProgram, "proj"),
      viewMat: gl.getUniformLocation(shaderProgram, "view"),
      modelMat: gl.getUniformLocation(shaderProgram, "model"),
      lightColor: gl.getUniformLocation(shaderProgram, "lightColor"),
      lightPos: gl.getUniformLocation(shaderProgram, "lightPos"),
      scale: gl.getUniformLocation(shaderProgram, "scale"),
      color: gl.getUniformLocation(shaderProgram, "icoColor"),
      defaultColor: gl.getUniformLocation(shaderProgram, "defaultColor"),
    },
  };

  // Find initial vertex positions
  let verts = generatePositions(programInfo, subdivisions);

  // Generate matrices
  const modelMatrix = generateMatrices(programInfo);
  const rotMatrix = mat4.create();

  // Upload shader config
  gl.uniform3fv(programInfo.uniformLocations.lightColor, lightCol);
  gl.uniform3fv(programInfo.uniformLocations.lightPos, lightPos);
  gl.uniform1i(programInfo.uniformLocations.defaultColor, 1);
  gl.uniform1f(programInfo.uniformLocations.scale, scale);

  // Spawn color picker
  initColorPicker(programInfo);

  // Set gl config
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clearDepth(1.0);
  gl.enable(gl.CULL_FACE);
  if (cullFace === "back") gl.cullFace(gl.BACK);
  else if (cullFace === "front") gl.cullFace(gl.FRONT);

  // Get start time
  let sTime = Date.now();
  let cTime, eTime;
  // Use shader program
  gl.useProgram(programInfo.program);

  // Render function
  function render() {
    // Elapsed time
    cTime = Date.now();
    eTime = cTime - sTime;
    sTime = cTime;

    // Clear color (no depth - taken care of by cullFace)
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Calculate velocity
    icoVelocity(eTime);

    // Refresh model matrix
    gl.uniformMatrix4fv(
      programInfo.uniformLocations.modelMat,
      false,
      modelMatrix
    );

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 3 * verts);

    // Render next frame
    requestAnimationFrame(render);
  }

  // Add event listeners
  document.addEventListener("keypress", updateVerts);
  gl.canvas.addEventListener("wheel", scaleIco);

  gl.canvas.addEventListener("mousedown", () => {
    gl.canvas.addEventListener("mousemove", rotateIco);
    document.addEventListener("mouseup", () => {
      gl.canvas.removeEventListener("mousemove", rotateIco);
    });
  });

  // Call Subdivide / Un-subdivide function
  function updateVerts(e) {
    if (e.code === "KeyS") {
      // "Subdivide"
      if (subdivisions < 8) {
        subdivisions += 1;
        verts = generatePositions(programInfo, subdivisions);
      }
    } else if (e.code === "KeyD") {
      // "Decimate / Unsubdivide"
      if (subdivisions > 0) {
        subdivisions -= 1;
        verts = generatePositions(programInfo, subdivisions);
      }
    }
  }

  // Scale based on scroll wheel
  function scaleIco(e) {
    if (e.wheelDelta > 0) {
      if (scale < 4.7) {
        scale *= 1.05;
      }
    } else {
      if (scale > 0.02) {
        scale /= 1.05;
      }
    }
    gl.uniform1f(programInfo.uniformLocations.scale, scale);
  }

  // Set velocity to mouse movement
  function rotateIco(e) {
    velX = e.movementX;
    velY = e.movementY;

    icoVelocity(eTime);
  }

  // Calculate velocity using time (framerate independent)
  function icoVelocity(eTime) {
    resistFac = resist * eTime;

    // Slow down velocity (BUG: wobbles instead of vel = 0)
    if (velX > 0) velX -= resistFac;
    else if (velX < 0) velX += resistFac;

    if (velY > 0) velY -= resistFac;
    else if (velY < 0) velY += resistFac;

    // Rotate matrix
    mat4.fromYRotation(rotMatrix, 0.004 * velX);
    mat4.rotateX(rotMatrix, rotMatrix, 0.004 * velY);
    mat4.multiply(modelMatrix, rotMatrix, modelMatrix);
  }

  // Call initial render
  requestAnimationFrame(render);
}

// Generate initial 12-vert icosohedron
function generateBasicIco() {
  let icoPos = [];
  const phi = (1 + Math.sqrt(5)) / 2; // constant phi
  const invRad = 1 / Math.sqrt((5 + Math.sqrt(5)) / 2); // will make rad = 1

  // Each vert is +/- on each axis
  let negt = [1, 1, 1, -1, -1, 1, -1, -1].map((i) => {
    return i * invRad;
  });

  // Calculate the 3 rectangles
  let pos = [];
  for (let i = 0; i < 8; i += 2) {
    pos.push([0, negt[i], negt[i + 1] * phi]);
    pos.push([negt[i], negt[i + 1] * phi, 0]);
    pos.push([negt[i] * phi, 0, negt[i + 1]]);
  }

  const vIndex1 = [1, 7, 8, 6, 2, 1]; // CCW around top
  const vIndex2 = [3, 5, 4, 10, 11, 3]; // CCW around bottom
  const vIndex3 = [1, 3, 7, 11, 8, 10, 6, 4, 2, 5, 1, 3]; // L->R middle
  // Find CCW order of each triangle
  for (let i = 0; i < 5; i++) {
    icoPos.push(pos[0], pos[vIndex1[i]], pos[vIndex1[i + 1]]);
    icoPos.push(pos[9], pos[vIndex2[i]], pos[vIndex2[i + 1]]);
    icoPos.push(
      pos[vIndex3[i * 2]],
      pos[vIndex3[i * 2 + 1]],
      pos[vIndex3[i * 2 + 2]]
    );
    icoPos.push(
      pos[vIndex3[i * 2 + 2]],
      pos[vIndex3[i * 2 + 1]],
      pos[vIndex3[i * 2 + 3]]
    );
  }

  return icoPos;
}

// Subdivide Ico (1 triangle -> 4)
function subdivIco(icoPos) {
  newIco = [];

  // Get triangle
  for (let i = 0; i < icoPos.length; i += 3) {
    // Get points
    const vertA = icoPos[i];
    const vertB = icoPos[i + 1];
    const vertC = icoPos[i + 2];

    const posA = vec3.fromValues(vertA[0], vertA[1], vertA[2]);
    const posB = vec3.fromValues(vertB[0], vertB[1], vertB[2]);
    const posC = vec3.fromValues(vertC[0], vertC[1], vertC[2]);

    // Get midpoints
    let midpointP = vec3.create();
    let midpointQ = vec3.create();
    let midpointR = vec3.create();

    midpointP = vec3.add(midpointP, posA, posB);
    midpointQ = vec3.add(midpointQ, posB, posC);
    midpointR = vec3.add(midpointR, posA, posC);

    vec3.scale(midpointP, midpointP, 1 / 2);
    vec3.scale(midpointQ, midpointQ, 1 / 2);
    vec3.scale(midpointR, midpointR, 1 / 2);

    // Scale to sphere (easy since r = 1)
    vec3.normalize(midpointP, midpointP);
    vec3.normalize(midpointQ, midpointQ);
    vec3.normalize(midpointR, midpointR);

    // vec3 -> array
    const midP = [midpointP[0], midpointP[1], midpointP[2]];
    const midQ = [midpointQ[0], midpointQ[1], midpointQ[2]];
    const midR = [midpointR[0], midpointR[1], midpointR[2]];

    // Push new triangles (4)
    newIco.push(vertA);
    newIco.push(midP);
    newIco.push(midR);

    newIco.push(vertB);
    newIco.push(midQ);
    newIco.push(midP);

    newIco.push(vertC);
    newIco.push(midR);
    newIco.push(midQ);

    newIco.push(midP);
    newIco.push(midQ);
    newIco.push(midR);
  }
  return newIco;
}

// Get basic ico, subdivide, and upload
function generatePositions(programInfo, subdivisions) {
  let icoPos = generateBasicIco(programInfo);

  for (let i = 0; i < subdivisions; i++) {
    icoPos = subdivIco(icoPos);
  }

  // Create position buffer and load data
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(icoPos.flat()),
    gl.STATIC_DRAW
  );

  // Upload vertex attrib for position
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.vertexAttribPointer(
    programInfo.attribLocations.vertexPos,
    3,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(programInfo.attribLocations.vertexPos);

  // Display triangles and subdivisions
  const verts = 20 * Math.pow(4, subdivisions);
  document.getElementById("subdivisions").innerHTML =
    "Subdivisions: " + subdivisions;
  document.getElementById("triangles").innerHTML = "Triangles: " + verts;

  return verts;
}

// Create and upload matrices
function generateMatrices(programInfo) {
  // Create model matrix
  const modelMatrix = mat4.create();

  // Create view matrix
  const viewMatrix = mat4.create();
  mat4.lookAt(
    viewMatrix,
    vec3.fromValues(0, 0, 5), // eye position
    vec3.fromValues(0, 0, 0), // target pos
    vec3.fromValues(0, 1, 0) // up vector
  );

  // Create projection matrix
  const projMatrix = mat4.create();
  mat4.perspective(
    projMatrix,
    60 * (Math.PI / 180), // fov
    gl.canvas.clientWidth / gl.canvas.clientHeight, // aspect ratio
    0.1, // near z
    100.0 // far z
  );

  gl.useProgram(programInfo.program);

  // Upload matrices
  gl.uniformMatrix4fv(programInfo.uniformLocations.viewMat, false, viewMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.projMat, false, projMatrix);

  return modelMatrix;
}

// Create shaders and shader program
function createShaderProgram(vertSource, fragSource) {
  // Create and compile shaders
  const vertShader = gl.createShader(gl.VERTEX_SHADER, vertSource);
  const fragShader = gl.createShader(gl.FRAGMENT_SHADER, fragSource);
  gl.shaderSource(vertShader, vertSource);
  gl.shaderSource(fragShader, fragSource);
  gl.compileShader(vertShader);
  gl.compileShader(fragShader);

  // Error check vert shader
  if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
    alert(
      "An error occured compiling the vert shader: " +
        gl.getShaderInfoLog(vertShader)
    );
    gl.deleteShader(vertShader);
  }

  // Error check frag shader
  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
    alert(
      "An error occured compiling the frag shader: " +
        gl.getShaderInfoLog(fragShader)
    );
    gl.deleteShader(fragShader);
  }

  // Create and link shader program
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertShader);
  gl.attachShader(shaderProgram, fragShader);
  gl.linkProgram(shaderProgram);

  return shaderProgram;
}

// Create color picker
function initColorPicker(programInfo) {
  const colorPicker = new iro.ColorPicker("#color", {
    width: 160,
    color: "#00f",
    handleSvg: "#hex",
    handleProps: { x: 2, y: 0 },
  });
  colorPicker.on("color:change", function (color) {
    console.log(color.red);
    gl.uniform3f(
      programInfo.uniformLocations.color,
      color.red / 255,
      color.green / 255,
      color.blue / 255
    );
    gl.uniform1i(programInfo.uniformLocations.defaultColor, 0);
  });
}
