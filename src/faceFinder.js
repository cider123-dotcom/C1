// faceFinder.js
// Finds interior faces of a planar straight-line graph (vertices + edges)
// Exports findFaces(vertices, edges) and sanitizeInput(vertices, edges)

function polygonArea(points) {
  let a = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const j = (i + 1) % n;
    a += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }
  return a / 2;
}

// Sanitize input: remove self-loops, duplicate edges, and prune degree-1 dangling chains
// Also remove vertices that become isolated; return reindexed vertices and edges

// Complexity O(E + V) where E is number of edges and V is number of vertices. Worst case is a single chain of degree-1 vertices which gets fully pruned
function sanitizeInput(vertices, edges) {
  const n = vertices.length;
  const edgeSet = new Set();

  for (const e of edges) {
    const [u, v] = e;
    if (u === v) continue; // drop self-loop
    const a = Math.min(u, v), b = Math.max(u, v);
    edgeSet.add(a + '>' + b); // dedupe undirected edge
  }

  // build adjacency sets
  const adj = Array.from({ length: n }, () => new Set());
  for (const key of edgeSet) {
    const parts = key.split('>');
    const a = Number(parts[0]), b = Number(parts[1]);
    adj[a].add(b);
    adj[b].add(a);
  }

  const deg = adj.map(s => s.size);
  const stack = [];
  for (let i = 0; i < n; i++) if (deg[i] === 1) stack.push(i);

  while (stack.length) {
    const v = stack.pop();
    if (deg[v] !== 1) continue;
    // get its sole neighbor
    let neighbor = null;
    for (const x of adj[v]) { neighbor = x; break; }
    if (neighbor === null) continue;
    const a = Math.min(v, neighbor), b = Math.max(v, neighbor);
    const key = a + '>' + b;
    if (edgeSet.has(key)) {
      edgeSet.delete(key);
      adj[v].delete(neighbor);
      adj[neighbor].delete(v);
      deg[v] = adj[v].size;
      deg[neighbor] = adj[neighbor].size;
      if (deg[neighbor] === 1) stack.push(neighbor);
    }
  }

  // collect sanitized edges and the set of used vertex indices
  const sanitizedEdges = [];
  const used = new Set();
  for (const key of edgeSet) {
    const parts = key.split('>');
    const a = Number(parts[0]), b = Number(parts[1]);
    sanitizedEdges.push([a, b]);
    used.add(a); used.add(b);
  }

  // remap vertices: keep only used vertices and produce new indices
  const oldToNew = new Array(n).fill(-1);
  const newVertices = [];
  const newToOld = [];
  let nextIdx = 0;
  for (let i = 0; i < n; i++) {
    if (used.has(i)) {
      oldToNew[i] = nextIdx;
      newToOld.push(i);
      newVertices.push(vertices[i]);
      nextIdx++;
    }
  }

  // remap edges to new indices
  const remappedEdges = sanitizedEdges.map(([a, b]) => [oldToNew[a], oldToNew[b]]);

  return { vertices: newVertices, edges: remappedEdges, oldToNew, newToOld };
}
//Assuming the sanitized input has V vertices and E edges
// The main loop visits each directed edge at most once, so O(E) for the face-walking part
// The sorting of neighbors is O(V * d log d) where d is the degree, d log d comes from the CCW sorting. In planar cases d can be bounded?
// The Area calculation goes over all FACEs, but there are less FACEs than edges so O(E)
//Overall complexity is O(V*dlogd + E)
function findFaces(vertices, edges) {
  // sanitize input and use reindexed vertices/edges
  const sanitized = sanitizeInput(vertices, edges);
  vertices = sanitized.vertices;
  const E = sanitized.edges;

  const n = vertices.length;
  const adj = Array.from({ length: n }, () => []);

  // build adjacency
  for (const e of E) {
    const [u, v] = e;
    adj[u].push(v);
    adj[v].push(u);
  }

  // sort neighbors CCW around each vertex
  const neigh = Array.from({ length: n }, () => null);
  const neighIndex = Array.from({ length: n }, () => ({}));

  for (let u = 0; u < n; u++) {
    const ux = vertices[u][0], uy = vertices[u][1];
    const arr = adj[u].slice();
    arr.sort((a, b) => {
      const angA = Math.atan2(vertices[a][1] - uy, vertices[a][0] - ux);
      const angB = Math.atan2(vertices[b][1] - uy, vertices[b][0] - ux);
      return angA - angB;
    });
    neigh[u] = arr;
    for (let i = 0; i < arr.length; i++) neighIndex[u][arr[i]] = i;
  }

  const visited = new Set();
  const faces = [];

  function key(a, b) { return a + '>' + b; }

  for (let u = 0; u < n; u++) {
    for (const v of neigh[u]) {
      const startKey = key(u, v);
      if (visited.has(startKey)) continue;

      // walk face keeping the edges to our left
      let cu = u, cv = v;
      const faceVerts = [];
      let safety = 0;
      while (true) {
        safety++;
        if (safety > E.length * 4) break; // fail-safe
        visited.add(key(cu, cv));
        faceVerts.push(cu);

        // at vertex cv, find index of cu
        const idx = neighIndex[cv][cu];
        // pick previous neighbor in CCW order (turn left)
        const degv = neigh[cv].length;
        if (degv === 0) break;
        const nextIdx = (idx - 1 + degv) % degv;
        const nw = neigh[cv][nextIdx];

        const nu = cv, nv = nw;
        if (nu === u && nv === v) break;
        cu = nu; cv = nv;
      }

      if (faceVerts.length >= 3) {
        // build polygon points
        const pts = faceVerts.map(i => vertices[i]);
        const area = polygonArea(pts);
        if (Math.abs(area) > 1e-12) {
          faces.push({ indices: faceVerts, polygon: pts, area });
        }
      }
    }
  }

  if (faces.length === 0) return [];

  // remove the external face: pick one with largest absolute area
  let maxIdx = 0;
  let maxA = Math.abs(faces[0].area);
  for (let i = 1; i < faces.length; i++) {
    const a = Math.abs(faces[i].area);
    if (a > maxA) { maxA = a; maxIdx = i; }
  }
  // remove it
  const interior = faces.slice(0, maxIdx).concat(faces.slice(maxIdx + 1));

  // normalize orientation: return polygons CCW (positive area)
  for (const f of interior) {
    if (f.area < 0) {
      f.indices = f.indices.slice().reverse();
      f.polygon = f.polygon.slice().reverse();
      f.area = -f.area;
    }
    f.area = Math.abs(f.area);
  }

  return interior;
}

// Expose for Node and browser
if (typeof module !== 'undefined' && module.exports) module.exports = { findFaces, sanitizeInput };
if (typeof window !== 'undefined') { window.findFaces = findFaces; window.sanitizeInput = sanitizeInput; }
