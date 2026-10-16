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
                vec3 ceilingBase = vec3(0.25, 0.26, 0.27);
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
                // Three-centimetre brick finish: narrow horizontal bricks with staggered joints.
                // The scale is deliberately fine so the wall reads as small-format brickwork.
                vec2 wallUV = vec2(v_pos.x + v_pos.z, v_pos.y);
                float brickWidth = 0.72;
                float brickHeight = 0.24;
                float row = floor(wallUV.y / brickHeight);
                float offset = mod(row, 2.0) * brickWidth * 0.5;
                vec2 brickUV = vec2(wallUV.x + offset, wallUV.y);
                vec2 cell = vec2(
                    fract(brickUV.x / brickWidth),
                    fract(brickUV.y / brickHeight)
                );
                float jointV = 1.0 - step(0.035, min(cell.y, 1.0 - cell.y));
                float jointH = 1.0 - step(0.035, min(cell.x, 1.0 - cell.x));
                float joint = max(jointV, jointH);

                // Warm, muted terracotta-grey bricks with subtle per-brick variation.
                float variation = fract(sin(dot(vec2(floor(brickUV.x / brickWidth), row),
                    vec2(12.9898, 78.233))) * 43758.5453);
                vec3 brickA = vec3(0.43, 0.31, 0.25);
                vec3 brickB = vec3(0.52, 0.38, 0.30);
                vec3 brickColor = mix(brickA, brickB, 0.25 + variation * 0.45);
                vec3 mortarColor = vec3(0.22, 0.20, 0.18);
                totalLight = mix(brickColor, mortarColor, joint);

                // Keep the brick texture softly lit to preserve the gallery atmosphere.
                totalLight *= mix(0.96, 1.0, smoothstep(0.1, 0.12, v_pos.y));
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
