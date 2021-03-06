import { goready, newwormhole, dial } from './dial.js';
import { genpassword } from './wordlist.js';

// TODO multiple streams.
// TODO have less of a global mess here. Maybe a "transfers" object for
// transfers in progress? Each could be mapped to a different datachannel
// there too, new object instantiated by ondatachannel callback.
let receiving;
let datachannel;

let pick = e => {
	let files = document.getElementById("filepicker").files;
	for (let i = 0; i < files.length; i++) {
		send(files[i]);
	}
}

let drop = e => {
	let files = e.dataTransfer.files;
	for (let i = 0; i < files.length; i++) {
		send(files[i]);
	}
}

let send = async f => {
	console.log("sending", f.name)
	datachannel.send(JSON.stringify({
		name: f.name,
		size: f.size,
		type: f.type,
	}));
	// TODO maybe wait for an ok message?
	// TODO progress bar. https://developer.mozilla.org/en-US/docs/Web/HTML/Element/progress
	console.log(f);
	datachannel.send(await f.arrayBuffer());
}

let receive = e => {
	// TODO stream data. https://github.com/maxogden/filereader-stream/blob/master/index.js
	// plan b: service worker to reflect stream back?
	if (receiving) {
		let blob = e.data
		if (blob instanceof ArrayBuffer) {
			blob = new Blob([e.data])
		}
		let a = document.createElement('a');
		a.href = window.URL.createObjectURL(blob); // TODO release this.
		a.download = receiving.name;
		a.style.display = 'none';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		receiving = null;
		return;
	}
	receiving = JSON.parse(e.data);
}

let connect = async e => {
	let pc = new RTCPeerConnection({"iceServers":[{"urls":"stun:stun.l.google.com:19302"}]});
	datachannel = pc.createDataChannel("data", {negotiated: true, id: 0});
	datachannel.onopen = connected;
	datachannel.onmessage = receive;
	datachannel.onclose = e => {
		disconnected();
		document.getElementById("info").innerHTML = "DISCONNECTED";
	};
	datachannel.onerror = e => {
		console.log("datachannel error:", e);
		disconnected();
		document.getElementById("info").innerHTML = "NETWORK ERROR TRY AGAIN";
	};
	try {
		if (document.getElementById("magiccode").value === "") {
			dialling();
			document.getElementById("info").innerHTML = "WAITING FOR THE OTHER SIDE";
			let pass = genpassword(2);
			let [slot, c] = await newwormhole(pc, pass);
			console.log ("assigned slot", slot, "pass", pass);
			document.getElementById("magiccode").value = slot + "-" + pass;
			await c;
		} else {
			dialling();
			document.getElementById("info").innerHTML = "CONNECTING";
			let [slot, ...passparts] = document.getElementById("magiccode").value.split("-");
			let pass = passparts.join("-");
			console.log("dialling slot", slot, "pass", pass);
			await dial(pc, slot, pass);
		}
	} catch (err) {
		console.log("handshake error:", err);
		disconnected();
		if (err == "bad key") {
			document.getElementById("info").innerHTML = "BAD KEY TRY AGAIN";
		} else if (err == "// TODO TIMEOUT / CANCELLATION") {
			document.getElementById("info").innerHTML = "TIMED OUT TRY AGAIN";
		} else {
			document.getElementById("info").innerHTML = "COULD NOT CONNECT TRY AGAIN";
		}
	}
}

let dialling = () => {
	document.body.classList.add("dialling");
	document.body.classList.remove("connected");
	document.body.classList.remove("disconnected");

	document.getElementById("dial").disabled = true;
	document.getElementById("magiccode").readOnly = true;
}

let connected = () => {
	document.body.classList.remove("dialling");
	document.body.classList.add("connected");
	document.body.classList.remove("disconnected");

	document.body.addEventListener('drop', drop);
	document.body.addEventListener('dragenter', highlight);
	document.body.addEventListener('dragover', highlight);
	document.body.addEventListener('drop', unhighlight);
	document.body.addEventListener('dragleave', unhighlight);

	document.getElementById("info").innerHTML = "OR DRAG FILES TO SEND";
}

let disconnected = () => {
	document.body.classList.remove("dialling");
	document.body.classList.remove("connected");
	document.body.classList.add("disconnected");

	document.getElementById("dial").disabled = false;
	document.getElementById("magiccode").readOnly = false;
	document.getElementById("magiccode").value = ""

	document.body.removeEventListener('drop', drop);
	document.body.removeEventListener('dragenter', highlight);
	document.body.removeEventListener('dragover', highlight);
	document.body.removeEventListener('drop', unhighlight);
	document.body.removeEventListener('dragleave', unhighlight);	
}

let highlight = e => {
	document.body.classList.add("highlight");
}

let unhighlight = e => {
	document.body.classList.remove("highlight");
}

let preventdefault = e => {
	e.preventDefault()
	e.stopPropagation()
}

document.addEventListener('DOMContentLoaded', async () => {
	document.getElementById("magiccode").value = "";
	document.getElementById("filepicker").addEventListener('change', pick);
	document.getElementById("dialog").addEventListener('submit', preventdefault);
	document.getElementById("dialog").addEventListener('submit', connect);
	document.body.addEventListener('drop', preventdefault);
	document.body.addEventListener('dragenter', preventdefault);
	document.body.addEventListener('dragover', preventdefault);
	document.body.addEventListener('drop', preventdefault);
	document.body.addEventListener('dragleave', preventdefault);
	await goready;
	document.getElementById("dial").disabled = false;
});
