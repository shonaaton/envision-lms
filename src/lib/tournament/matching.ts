/**
 * Maximum-weight matching on a general graph (Edmonds' blossom algorithm).
 *
 * Swiss pairing is a matching problem: every player must be paired with exactly
 * one opponent, and some pairings are better than others. Expressing the
 * pairing rules as edge weights and asking for the best matching gives an
 * answer that is optimal under those rules and — crucially — never fails to
 * find a legal pairing when one exists. A greedy scan does neither.
 *
 * This is a TypeScript port of the standard reference implementation of
 * Galil's O(n^3) variant (Joris van Rantwijk's `mwmatching`, public domain).
 * It is vendored rather than depended upon because this project ships
 * standalone and pins its dependencies tightly.
 *
 * The port is validated against exhaustive search in `matching.test.ts`, which
 * is the only honest way to trust an algorithm of this shape.
 */

export type WeightedEdge = [number, number, number];

const CHECK_DELTA = false;

/**
 * Compute a maximum-weight matching.
 *
 * @param edges  `[i, j, weight]` triples over vertices `0..n-1`.
 * @param maxCardinality  when true, maximise the number of pairs first and the
 *   total weight second. Swiss pairing always wants this: leaving a player
 *   unpaired is worse than any weight it could save.
 * @returns `mate[v]` = the vertex matched to `v`, or `-1` if unmatched.
 */
export function maxWeightMatching(edges: WeightedEdge[], maxCardinality = false): number[] {
  if (!edges.length) return [];

  let nvertex = 0;
  let maxweight = 0;
  for (const [i, j, w] of edges) {
    if (i >= nvertex) nvertex = i + 1;
    if (j >= nvertex) nvertex = j + 1;
    if (w > maxweight) maxweight = w;
  }
  const nedge = edges.length;

  // endpoint[p] is the vertex at the far end of edge-half p.
  const endpoint: number[] = new Array(2 * nedge);
  for (let p = 0; p < 2 * nedge; p += 1) endpoint[p] = edges[Math.floor(p / 2)][p % 2];

  const neighbend: number[][] = Array.from({ length: nvertex }, () => []);
  for (let k = 0; k < nedge; k += 1) {
    const [i, j] = edges[k];
    neighbend[i].push(2 * k + 1);
    neighbend[j].push(2 * k);
  }

  const mate: number[] = new Array(nvertex).fill(-1);

  // Labels: 0 = unlabelled, 1 = S (outer), 2 = T (inner), 5 = pseudo-vertex
  // that has been absorbed into a blossom.
  const label: number[] = new Array(2 * nvertex).fill(0);
  const labelend: number[] = new Array(2 * nvertex).fill(-1);
  const inblossom: number[] = Array.from({ length: nvertex }, (_, index) => index);
  const blossomparent: number[] = new Array(2 * nvertex).fill(-1);
  const blossomchilds: (number[] | null)[] = new Array(2 * nvertex).fill(null);
  const blossombase: number[] = [...Array.from({ length: nvertex }, (_, index) => index), ...new Array(nvertex).fill(-1)];
  const blossomendps: (number[] | null)[] = new Array(2 * nvertex).fill(null);
  const bestedge: number[] = new Array(2 * nvertex).fill(-1);
  const blossombestedges: (number[] | null)[] = new Array(2 * nvertex).fill(null);
  const unusedblossoms: number[] = Array.from({ length: nvertex }, (_, index) => nvertex + index);
  const dualvar: number[] = [...new Array(nvertex).fill(maxweight), ...new Array(nvertex).fill(0)];
  const allowedge: boolean[] = new Array(nedge).fill(false);
  let queue: number[] = [];

  const slack = (k: number) => dualvar[edges[k][0]] + dualvar[edges[k][1]] - 2 * edges[k][2];

  /** Vertices inside blossom b, or [b] for a real vertex. */
  function* blossomLeaves(b: number): Generator<number> {
    if (b < nvertex) {
      yield b;
      return;
    }
    for (const t of blossomchilds[b] as number[]) {
      if (t < nvertex) yield t;
      else yield* blossomLeaves(t);
    }
  }

  function assignLabel(w: number, t: number, p: number) {
    const b = inblossom[w];
    label[w] = t;
    label[b] = t;
    labelend[w] = p;
    labelend[b] = p;
    bestedge[w] = -1;
    bestedge[b] = -1;
    if (t === 1) {
      for (const v of blossomLeaves(b)) queue.push(v);
    } else if (t === 2) {
      const base = blossombase[b];
      assignLabel(endpoint[mate[base]], 1, mate[base] ^ 1);
    }
  }

  /** Walk both alternating trees to find the least common ancestor. */
  function scanBlossom(v: number, w: number) {
    const path: number[] = [];
    let base = -1;
    let a = v;
    let b = w;
    while (a !== -1 || b !== -1) {
      let bl = inblossom[a];
      if (label[bl] & 4) {
        base = blossombase[bl];
        break;
      }
      path.push(bl);
      label[bl] = 5;
      if (labelend[bl] === -1) {
        a = -1;
      } else {
        a = endpoint[labelend[bl]];
        bl = inblossom[a];
        a = endpoint[labelend[bl]];
      }
      if (b !== -1) {
        const swap = a;
        a = b;
        b = swap;
      }
    }
    for (const bl of path) label[bl] = 1;
    return base;
  }

  function addBlossom(base: number, k: number) {
    let v = edges[k][0];
    let w = edges[k][1];
    const bb = inblossom[base];
    let bv = inblossom[v];
    let bw = inblossom[w];

    const b = unusedblossoms.pop() as number;
    blossombase[b] = base;
    blossomparent[b] = -1;
    blossomparent[bb] = b;

    const path: number[] = [];
    blossomchilds[b] = path;
    const endps: number[] = [];
    blossomendps[b] = endps;

    while (bv !== bb) {
      blossomparent[bv] = b;
      path.push(bv);
      endps.push(labelend[bv]);
      v = endpoint[labelend[bv]];
      bv = inblossom[v];
    }
    path.push(bb);
    path.reverse();
    endps.reverse();
    endps.push(2 * k);

    while (bw !== bb) {
      blossomparent[bw] = b;
      path.push(bw);
      endps.push(labelend[bw] ^ 1);
      w = endpoint[labelend[bw]];
      bw = inblossom[w];
    }

    label[b] = 1;
    labelend[b] = labelend[bb];
    dualvar[b] = 0;
    for (const leaf of blossomLeaves(b)) {
      if (label[inblossom[leaf]] === 2) queue.push(leaf);
      inblossom[leaf] = b;
    }

    // Cheapest edge from the new blossom to each outside vertex.
    const bestedgeto: number[] = new Array(2 * nvertex).fill(-1);
    for (const bv2 of path) {
      let nblists: number[][];
      if (blossombestedges[bv2] === null) {
        nblists = [];
        for (const leaf of blossomLeaves(bv2)) {
          nblists.push(neighbend[leaf].map((p) => Math.floor(p / 2)));
        }
      } else {
        nblists = [blossombestedges[bv2] as number[]];
      }
      for (const nblist of nblists) {
        for (const kk of nblist) {
          let [i, j] = edges[kk];
          if (inblossom[j] === b) {
            const swap = i;
            i = j;
            j = swap;
          }
          const bj = inblossom[j];
          if (bj !== b && label[bj] === 1 && (bestedgeto[bj] === -1 || slack(kk) < slack(bestedgeto[bj]))) {
            bestedgeto[bj] = kk;
          }
        }
      }
      blossombestedges[bv2] = null;
      bestedge[bv2] = -1;
    }
    const mybestedges = bestedgeto.filter((k2) => k2 !== -1);
    blossombestedges[b] = mybestedges;
    bestedge[b] = -1;
    for (const k2 of mybestedges) {
      if (bestedge[b] === -1 || slack(k2) < slack(bestedge[b])) bestedge[b] = k2;
    }
  }

  function expandBlossom(b: number, endstage: boolean) {
    for (const s of blossomchilds[b] as number[]) {
      blossomparent[s] = -1;
      if (s < nvertex) inblossom[s] = s;
      else if (endstage && dualvar[s] === 0) expandBlossom(s, endstage);
      else for (const v of blossomLeaves(s)) inblossom[v] = s;
    }

    if (!endstage && label[b] === 2) {
      const entrychild = inblossom[endpoint[labelend[b] ^ 1]];
      const childs = blossomchilds[b] as number[];
      const endps = blossomendps[b] as number[];
      let j = childs.indexOf(entrychild);
      let jstep: number;
      let endptrick: number;
      if (j & 1) {
        j -= childs.length;
        jstep = 1;
        endptrick = 0;
      } else {
        jstep = -1;
        endptrick = 1;
      }
      let p = labelend[b];
      while (j !== 0) {
        label[endpoint[p ^ 1]] = 0;
        label[endpoint[at(endps, j - endptrick) ^ endptrick ^ 1]] = 0;
        assignLabel(endpoint[p ^ 1], 2, p);
        allowedge[Math.floor(at(endps, j - endptrick) / 2)] = true;
        j += jstep;
        p = at(endps, j - endptrick) ^ endptrick;
        allowedge[Math.floor(p / 2)] = true;
        j += jstep;
      }
      const bv = at(childs, j);
      label[endpoint[p ^ 1]] = 2;
      label[bv] = 2;
      labelend[endpoint[p ^ 1]] = p;
      labelend[bv] = p;
      bestedge[bv] = -1;
      j += jstep;
      while (at(childs, j) !== entrychild) {
        const bv2 = at(childs, j);
        if (label[bv2] === 1) {
          j += jstep;
          continue;
        }
        let v = -1;
        for (const leaf of blossomLeaves(bv2)) {
          v = leaf;
          if (label[leaf] !== 0) break;
        }
        if (label[v] !== 0) {
          label[v] = 0;
          label[endpoint[mate[blossombase[bv2]]]] = 0;
          assignLabel(v, 2, labelend[v]);
        }
        j += jstep;
      }
    }

    label[b] = -1;
    labelend[b] = -1;
    blossomchilds[b] = null;
    blossomendps[b] = null;
    blossombase[b] = -1;
    blossombestedges[b] = null;
    bestedge[b] = -1;
    unusedblossoms.push(b);
  }

  /** Python-style negative indexing, which the reference algorithm relies on. */
  function at(list: number[], index: number) {
    return list[((index % list.length) + list.length) % list.length];
  }

  function rotate(list: number[], n: number) {
    const shifted = list.slice(n).concat(list.slice(0, n));
    for (let index = 0; index < list.length; index += 1) list[index] = shifted[index];
  }

  function augmentBlossom(b: number, v: number) {
    let t = v;
    while (blossomparent[t] !== b) t = blossomparent[t];
    if (t >= nvertex) augmentBlossom(t, v);
    const childs = blossomchilds[b] as number[];
    const endps = blossomendps[b] as number[];
    const i = childs.indexOf(t);
    let j = i;
    let jstep: number;
    let endptrick: number;
    if (i & 1) {
      j -= childs.length;
      jstep = 1;
      endptrick = 0;
    } else {
      jstep = -1;
      endptrick = 1;
    }
    while (j !== 0) {
      j += jstep;
      let t2 = at(childs, j);
      const p = at(endps, j - endptrick) ^ endptrick;
      if (t2 >= nvertex) augmentBlossom(t2, endpoint[p]);
      j += jstep;
      t2 = at(childs, j);
      if (t2 >= nvertex) augmentBlossom(t2, endpoint[p ^ 1]);
      mate[endpoint[p]] = p ^ 1;
      mate[endpoint[p ^ 1]] = p;
    }
    rotate(childs, i);
    rotate(endps, i);
    blossombase[b] = blossombase[childs[0]];
  }

  function augmentMatching(k: number) {
    const [v0, w0] = edges[k];
    for (const [s0, p0] of [
      [v0, 2 * k + 1],
      [w0, 2 * k],
    ]) {
      let s = s0;
      let p = p0;
      for (;;) {
        const bs = inblossom[s];
        if (bs >= nvertex) augmentBlossom(bs, s);
        mate[s] = p;
        if (labelend[bs] === -1) break;
        const t = endpoint[labelend[bs]];
        const bt = inblossom[t];
        const s2 = endpoint[labelend[bt]];
        const j = endpoint[labelend[bt] ^ 1];
        if (bt >= nvertex) augmentBlossom(bt, j);
        mate[j] = labelend[bt];
        p = labelend[bt] ^ 1;
        s = s2;
      }
    }
  }

  for (let t = 0; t < nvertex; t += 1) {
    label.fill(0);
    bestedge.fill(-1);
    for (let b = nvertex; b < 2 * nvertex; b += 1) blossombestedges[b] = null;
    allowedge.fill(false);
    queue = [];

    for (let v = 0; v < nvertex; v += 1) {
      if (mate[v] === -1 && label[inblossom[v]] === 0) assignLabel(v, 1, -1);
    }

    let augmented = false;
    for (;;) {
      while (queue.length && !augmented) {
        const v = queue.pop() as number;
        for (const p of neighbend[v]) {
          const k = Math.floor(p / 2);
          const w = endpoint[p];
          if (inblossom[v] === inblossom[w]) continue;
          if (!allowedge[k]) {
            const kslack = slack(k);
            if (kslack <= 0) allowedge[k] = true;
          }
          if (allowedge[k]) {
            if (label[inblossom[w]] === 0) {
              assignLabel(w, 2, p ^ 1);
            } else if (label[inblossom[w]] === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) {
                addBlossom(base, k);
              } else {
                augmentMatching(k);
                augmented = true;
                break;
              }
            } else if (label[w] === 0) {
              label[w] = 2;
              labelend[w] = p ^ 1;
            }
          } else if (label[inblossom[w]] === 1) {
            const b = inblossom[v];
            if (bestedge[b] === -1 || slack(k) < slack(bestedge[b])) bestedge[b] = k;
          } else if (label[w] === 0) {
            if (bestedge[w] === -1 || slack(k) < slack(bestedge[w])) bestedge[w] = k;
          }
        }
      }
      if (augmented) break;

      // No augmenting path with the current duals: adjust them.
      let deltatype = -1;
      let delta: number | null = null;
      let deltaedge = -1;
      let deltablossom = -1;

      if (!maxCardinality) {
        deltatype = 1;
        delta = Math.min(...dualvar.slice(0, nvertex));
      }

      for (let v = 0; v < nvertex; v += 1) {
        if (label[inblossom[v]] === 0 && bestedge[v] !== -1) {
          const d = slack(bestedge[v]);
          if (deltatype === -1 || d < (delta as number)) {
            delta = d;
            deltatype = 2;
            deltaedge = bestedge[v];
          }
        }
      }

      for (let b = 0; b < 2 * nvertex; b += 1) {
        if (blossomparent[b] === -1 && label[b] === 1 && bestedge[b] !== -1) {
          const kslack = slack(bestedge[b]);
          const d = kslack / 2;
          if (deltatype === -1 || d < (delta as number)) {
            delta = d;
            deltatype = 3;
            deltaedge = bestedge[b];
          }
        }
      }

      for (let b = nvertex; b < 2 * nvertex; b += 1) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1 && label[b] === 2 && (deltatype === -1 || dualvar[b] < (delta as number))) {
          delta = dualvar[b];
          deltatype = 4;
          deltablossom = b;
        }
      }

      if (deltatype === -1) {
        // Only reachable with maxCardinality: no further improvement exists.
        deltatype = 1;
        delta = Math.max(0, Math.min(...dualvar.slice(0, nvertex)));
      }

      for (let v = 0; v < nvertex; v += 1) {
        if (label[inblossom[v]] === 1) dualvar[v] -= delta as number;
        else if (label[inblossom[v]] === 2) dualvar[v] += delta as number;
      }
      for (let b = nvertex; b < 2 * nvertex; b += 1) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1) {
          if (label[b] === 1) dualvar[b] += delta as number;
          else if (label[b] === 2) dualvar[b] -= delta as number;
        }
      }

      if (deltatype === 1) break;
      if (deltatype === 2) {
        allowedge[deltaedge] = true;
        let [i] = edges[deltaedge];
        if (label[inblossom[i]] === 0) i = edges[deltaedge][1];
        queue.push(i);
      } else if (deltatype === 3) {
        allowedge[deltaedge] = true;
        const [i] = edges[deltaedge];
        queue.push(i);
      } else if (deltatype === 4) {
        expandBlossom(deltablossom, false);
      }
      if (CHECK_DELTA) {
        // Placeholder for the reference implementation's invariant checks.
      }
    }

    if (!augmented) break;

    for (let b = nvertex; b < 2 * nvertex; b += 1) {
      if (blossomparent[b] === -1 && blossombase[b] >= 0 && label[b] === 1 && dualvar[b] === 0) {
        expandBlossom(b, true);
      }
    }
  }

  // Translate edge-half references back into vertex ids.
  for (let v = 0; v < nvertex; v += 1) {
    if (mate[v] >= 0) mate[v] = endpoint[mate[v]];
  }
  return mate;
}
