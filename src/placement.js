'use strict';
const texture = require('./image');
const mat4 = require('gl-mat4');

const renderDist = 40;
const loadDist = 20;
const unloadDist = 80;
const fovxMargin = Math.PI/32;

const dynamicResPeriod = 3000;
let dynamicRes = "high";
let dynamicResTimer;

const culling = (ppos, pangle, fovx, {vseg, angle}) => {
    const sx1 = vseg[0][0] - ppos[0];
    const sy1 = vseg[0][1] - ppos[2];
    const sx2 = vseg[1][0] - ppos[0];
    const sy2 = vseg[1][1] - ppos[2];
    const angles = [angle, pangle - fovx/2 - fovxMargin + Math.PI/2, pangle + fovx/2 + fovxMargin - Math.PI/2];
    for(let a of angles) {
        const nx = Math.sin(a);
        const ny = -Math.cos(a);
        if(nx * sx1 + ny * sy1 < 0 && nx * sx2 + ny * sy2 < 0)
            return false;
    }
    return true;
};

module.exports = (regl, {placements, getAreaIndex}) => {
    //console.log(areas);
    let batch = [], shownBatch = [];
    const surveyBatch = [];
    const surveyTexture = regl.texture();
    let surveyReady = false;
    let surveyAspect = 0.62;
    let fetching = true;

    // Load the small voting-survey flyer once; reuse its texture beside every artwork.
    fetch('images/' + encodeURIComponent('فرم نظر سنجی .png'))
        .then(response => {
            if (!response.ok) throw new Error('Could not load survey flyer');
            return response.blob();
        })
        .then(blob => createImageBitmap(blob))
        .then(bitmap => {
            surveyAspect = bitmap.width / bitmap.height;
            surveyTexture({ data: bitmap, flipY: true });
            surveyReady = true;
            batch.forEach((painting, i) => { if (painting) addSurveyFlyer(painting, i); });
        })
        .catch(error => console.error(error));

    const addSurveyFlyer = (painting, index) => {
        if (!surveyReady || !painting || painting.file === '1.jpg' || painting.isSurveyFlyer) return;
        const { pos, dir, segLen, width, globalScale, horiz, vert, angle } = painting;
        const ux = dir[0] / segLen;
        const uz = dir[1] / segLen;
        const flyerHalfWidth = width / 5;
        const flyerHalfHeight = width / (5 * surveyAspect);
        const flyerPos = [pos[0] + ux * (2 * width + 0.035), 2.1 - flyerHalfHeight, pos[2] + uz * (2 * width + 0.035)];
        const flyerScale = [2 * flyerHalfWidth * horiz + 0.1 * vert, 2 * flyerHalfHeight, 2 * flyerHalfWidth * vert + 0.1 * horiz];
        const model = [];
        mat4.fromTranslation(model, flyerPos);
        mat4.scale(model, model, flyerScale);
        mat4.rotateY(model, model, -angle);
        surveyBatch[index] = {
            ...painting,
            tex: surveyTexture,
            text: null,
            textmodel: null,
            model,
            width: flyerHalfWidth,
            isSurveyFlyer: true
        };
    };
    const loadPainting = (p) => {
        // Keep each image attached to its intended wall even when image downloads finish out of order.
        const placementIndex = Number.isInteger(p.image_id) ? p.image_id : batch.length;
        const seg = placements[placementIndex];
        // Calculate painting position, direction, normal angle and scale
        const dir = [seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]];
        const norm = [seg[1][1] - seg[0][1], seg[0][0] - seg[1][0]];
        const segLen = Math.hypot(dir[0], dir[1]);
        let globalScale = 4.5 / (3 + p.aspect); //tweaked to look good
        globalScale = Math.min(globalScale, segLen / p.aspect / 2.2); //clamp horizontal
        globalScale = Math.min(globalScale, 2 / 1.2); //clamp vertical
        // The first local image (images/1.jpg) is the exhibition banner.
        // Give it a little more height than the other paintings.
        if (p.file === '1.jpg') {
            globalScale = Math.min(1.95, segLen / p.aspect / 2.2);
        }
        const pos = [(seg[0][0] + seg[1][0]) / 2, 2.1 - globalScale, (seg[0][1] + seg[1][1]) / 2];
        const angle = Math.atan2(dir[1], dir[0]);
        const horiz = Math.abs(angle % 3) < 1 ? 1 : 0;
        const vert = 1 - horiz;
        const width = globalScale * p.aspect;
        const scale = [
            2 * width * horiz + 0.1 * vert,
            2 * globalScale,
            2 * width * vert + 0.1 * horiz];
        // The exhibition banner (1.jpg) stands on its own; do not render a caption beneath it.
        const text = p.file === '1.jpg' ? null : p.textGen(width);
        const d1 = width / segLen;
        const d2 = 0.005 / Math.hypot(norm[0], norm[1]);
        // Visible painting segment for culling
        const vseg = [
            [pos[0] - dir[0] * d1 * 2, pos[2] - dir[1] * d1],
            [pos[0] + dir[0] * d1 * 2, pos[2] + dir[1] * d1]
        ];
        // Offset pos to account for painting width and depth
        pos[0] -= dir[0] * d1 + norm[0] * d2;
        pos[2] -= dir[1] * d1 + norm[1] * d2;
        // Calculate model matrix
        const model = [];
        mat4.fromTranslation(model, pos);
        mat4.scale(model, model, scale);
        mat4.rotateY(model, model, -angle);
        const textmodel = [];
        // Place the larger caption just above the artwork instead of below it.
        mat4.fromTranslation(textmodel, [pos[0], 2.1 + globalScale, pos[2]]);
        mat4.scale(textmodel, textmodel, [2,2,2]);
        mat4.rotateY(textmodel, textmodel, -angle);
        batch[placementIndex] = { ...p, vseg, angle, model, textmodel, text, width, textGen:null,
            pos: [...pos], dir: [...dir], segLen, globalScale, horiz, vert };
        addSurveyFlyer(batch[placementIndex], placementIndex);
    };
    // Fetch the first textures
    texture.fetch(regl, 40, dynamicRes, loadPainting, () => fetching = false);
    return {
        update: (pos, angle, fovX) => {
            // Estimate player position index
            let index = getAreaIndex(pos[0], pos[2], 4);
            if (index === -1) return; // Out of bound => do nothing
            // Unload far textures
            batch.slice(0, Math.max(0, index - unloadDist)).map(t => texture.unload(t));
            batch.slice(index + unloadDist).map(t => texture.unload(t));
            // Load close textures
            shownBatch = batch.slice(Math.max(0, index - renderDist), index + renderDist).filter(Boolean);
            shownBatch = shownBatch.concat(surveyBatch.slice(Math.max(0, index - renderDist), index + renderDist).filter(Boolean));
            shownBatch.map(t => texture.load(regl, t, dynamicRes));
            // Frustum / Orientation culling
            shownBatch = shownBatch.filter(t => t.tex && culling(pos, angle, fovX, t));
            // Fetch new textures
            if (index <= batch.length - loadDist) return;
            if (!fetching) {
                texture.fetch(regl, 10, dynamicRes, loadPainting, () => fetching = false);
                fetching = true;
            }
            // Update dynamic resolution
            dynamicRes = "low";
            if (dynamicResTimer) clearTimeout(dynamicResTimer);
            dynamicResTimer = setTimeout(() => dynamicRes = "high", dynamicResPeriod);
        },
        batch: () => shownBatch
    };
};