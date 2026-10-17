'use strict';

const loadTexture = async (texture, url) => {
    const result = await fetch(url);
    const blob = await result.blob();
    const data = await createImageBitmap(blob);
    texture({data,
        wrapS: 'repeat',
        wrapT: 'repeat'
    });
};

module.exports = (regl, data, useReflexion) => {
    const wallTexture = regl.texture();
    const floorTexture = regl.texture();
    loadTexture(wallTexture, "res/wall.jpg");
    loadTexture(floorTexture, "res/floor.jpg");
    return regl({
        frag: `
        precision lowp float;
        varying vec3 v_pos, v_relativepos, v_normal;
        uniform sampler2D wallTexture;
        uniform sampler2D floorTexture;

        void main() {
            float dist = length(v_relativepos);
            vec3 totalLight;

            // Dark ceiling with slightly smaller, crisp-edged LED-style square panels.
            if (v_normal.y < -0.5) {
                vec2 ceilingCell = mod(v_pos.xz, 6.0);
                float panelMargin = 1.15;
                float panelEnd = 6.0 - panelMargin;
                float lightPanel = step(panelMargin, ceilingCell.x)
                    * step(panelMargin, ceilingCell.y)
                    * (1.0 - step(panelEnd, ceilingCell.x))
                    * (1.0 - step(panelEnd, ceilingCell.y));
                // Warm light cream ceiling to harmonize with the golden brick wall.
                vec3 ceilingBase = vec3(0.72, 0.68, 0.59);
                vec3 panelWhite = vec3(0.98, 0.98, 0.96);
                totalLight = mix(ceilingBase, panelWhite, lightPanel);
            } else if (v_normal.y > 0.5) {
                // Keep the marble floor muted so the artwork, not the room, draws attention.
                vec3 stone = vec3(0.76, 0.73, 0.68);
                vec3 textureColor = texture2D(floorTexture, v_pos.xz / 8.0).rgb;
                totalLight = mix(stone, textureColor, 0.06);
                float pattern = sin((v_pos.x + v_pos.z * 0.65) * 2.4
                    + sin(v_pos.x * 0.7 + v_pos.z * 0.3) * 2.0);
                float vein = pow(1.0 - abs(pattern), 18.0);
                totalLight = mix(totalLight, vec3(0.55, 0.52, 0.47), vein * 0.12);
            } else {
                // Warm medium-tone wood wall with horizontal boards and natural grain.
                vec2 woodUV = vec2(v_pos.x + v_pos.z, v_pos.y);
                float boardHeight = 0.62;
                float boardPosition = fract(woodUV.y / boardHeight);
                float boardSeam = 1.0 - step(0.012, min(boardPosition, 1.0 - boardPosition));

                // Layered, gently irregular grain; keep the finish between light oak and walnut.
                float warpedX = woodUV.x
                    + 0.035 * sin(woodUV.y * 7.0)
                    + 0.018 * sin(woodUV.y * 19.0 + woodUV.x * 0.35);
                float grainA = sin(warpedX * 18.0 + sin(warpedX * 2.2) * 1.7);
                float grainB = sin(warpedX * 43.0 + sin(woodUV.y * 3.0) * 0.8);
                float grain = grainA * 0.035 + grainB * 0.012;
                float boardVariation = fract(sin(floor(woodUV.y / boardHeight) * 19.19) * 43758.5453);
                vec3 woodBase = mix(vec3(0.43, 0.27, 0.15), vec3(0.56, 0.38, 0.23), boardVariation * 0.65 + 0.15);
                vec3 woodColor = woodBase + vec3(grain * 1.0, grain * 0.72, grain * 0.45);
                vec3 seamColor = vec3(0.25, 0.16, 0.095);
                totalLight = mix(woodColor, seamColor, boardSeam);

                // Gentle light keeps the wood grain visible without making the wall too bright.
                totalLight *= 0.98 + 0.02 * smoothstep(0.1, 0.12, v_pos.y);
            }

            float alpha = .98 + smoothstep(150., 0., dist) - v_normal.y;
            gl_FragColor = vec4(totalLight, ${useReflexion ? "alpha" : "1.0"});
        }`,

        vert: `
        precision highp float;
        uniform mat4 proj, view;
        attribute vec3 position, normal;
        varying vec3 v_pos, v_relativepos, v_normal;
        uniform float yScale;
        void main() {
            vec3 pos = position;
            v_pos = pos;
            v_relativepos = (view * vec4(pos, 1)).xyz;
            pos.y *= yScale;
            v_normal = normal;
            gl_Position = proj * view * vec4(pos, 1);
        }`,

        attributes: {
            position: data.position,
            normal: data.normal
        },

        blend: useReflexion ? {
            enable: true,
            func: {
                src: 'src alpha',
                dst: 'one minus src alpha'
            },
        } : {},

        uniforms: {
            wallTexture,
            floorTexture
        },

        elements: new Uint32Array(data.elements)
    });
};
