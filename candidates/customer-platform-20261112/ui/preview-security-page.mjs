import {mountPassivePreview} from '../worker/preview.mjs';
import {maliciousPreviewArtifact} from '../worker/preview-malicious-fixture.mjs';
const frame=document.querySelector('iframe');const result=mountPassivePreview(frame,maliciousPreviewArtifact);document.querySelector('#preview-security-result').textContent=JSON.stringify(result);
