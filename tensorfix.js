// function to copy node_modules/@tensorflow/tfjs-node/deps/lib/tensorflow.dll to node_modules/@tensorflow/tfjs-node/lib/napi-v6/

// recursively search node_modules for tensorflow.dll and store path in a variable
const fs = require('fs');
const path = require('path');
const tfjsNodePath = path.join(
  __dirname,
  'node_modules',
  '@tensorflow',
  'tfjs-node',
);
const targetPath = path.join(tfjsNodePath, 'lib', 'napi-v6');
// Ensure the target directory exists
if (!fs.existsSync(targetPath)) {
  fs.mkdirSync(targetPath, { recursive: true });
}
// Find the tensorflow.dll file in the node_modules directory
const tensorflowDllPath = findTensorflowDll(tfjsNodePath);

console.log(`tensorflow.dll found at: ${tensorflowDllPath}`);

// now find all folder locations containing a file called tfjs_binding.node in node_modules
// this function will return an array of paths
// that contain the tfjs_binding.node file
const tfjsBindingPaths = findTfjsBindingPaths(tfjsNodePath);

console.log(`Found ${tfjsBindingPaths.length} tfjs_binding.node files:`);
tfjsBindingPaths.forEach((bindingPath) => {
  console.log(`- ${bindingPath}`);
});

// loop through the tfjsBindingPaths and copy the tensorflow.dll file to each of them
// ignore if the destination location last folder does not start with "napi-"
for (const bindingPath of tfjsBindingPaths) {
  const bindingDir = path.dirname(bindingPath);
  const lastFolder = path.basename(bindingDir);
  if (lastFolder.startsWith('napi-')) {
    const destPath = path.join(bindingDir, 'tensorflow.dll');
    console.log(`Copying tensorflow.dll to: ${destPath}`);
    fs.copyFileSync(tensorflowDllPath, destPath);
  } else {
    console.log(`Skipping ${bindingDir} as it does not start with "napi-"`);
  }
}

function findTfjsBindingPaths(dir) {
  const results = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (file === 'tfjs_binding.node') {
      results.push(filePath);
    } else if (fs.statSync(filePath).isDirectory()) {
      results.push(...findTfjsBindingPaths(filePath));
    }
  }
  return results;
}

function findTensorflowDll(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (file === 'tensorflow.dll') {
      return filePath;
    }
    if (fs.statSync(filePath).isDirectory()) {
      const found = findTensorflowDll(filePath);
      if (found) {
        return found;
      }
    }
  }
  return null;
}
