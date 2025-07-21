class TrackVacancyRegister {
    constructor() {
        this.state = "vacant"; // vacant, occupied or disturbed
    }

    possibleActions() {
        return [ "toggle occupation" ];
    }

    executeAction(text) {
        switch (text) {
            case "toggle occupation":
                this.toggleOccupation();
                break;
            default:
                throw new Error("ERR11 unknow action");
                break;
        }
    }
    
    toggleOccupation() {
        if (this.state=="vacant") { this.state = "occupied"; }
        else if (this.state=="occupied") { this.state = "vacant"; }
        else { throw new Error("ERR13 unknown state");
        ; }
        // add other cases like disturbed, etc
    }

}

class Route {
    constructor(star_to_finish_topo_el) {
        this.star_to_finish_topo_el = star_to_finish_topo_el;
    }
}

class TopoElement {
    constructor(name) {
        this.neighbors = []; // All topoelements are first created, then they are linked
        this.name = name;
        this.locked = false; // Locked in a shunting route. Rangierfahsrtassen Verschluss
        this.graphical_rep = undefined;
    }

    // possibleActions() {
    //     return [];
    // }
}

class Switch extends TopoElement {
    constructor(arr) {
        const name = arr[0];
        super(name);
        this.position = "left"; // left, right, unknown, heeled
        this.tvr = new TrackVacancyRegister();
    }
    
    static build(arr) {
        return new Switch(arr);
    }
    
    possibleActions() {
        const switch_arr = [ "turn switch" ];
        return switch_arr.concat(this.tvr.possibleActions());
    }

    executeAction(text) {
        switch (text) {
            case "turn switch":
                this.turnSwitch();
                break;
            default:
                this.tvr.executeAction(text);
                break;
        }
    }

    turnSwitch() {
        if (this.position=="left") { this.position = "right"; }
        else if (this.position=="right") { this.position = "left"; }
        else { throw new Error("ERR12 unknown position");
        ; }
        // add other cases like heeled, etc
    }
}

class Segment extends TopoElement {
    constructor(arr) {
        const name = arr[0];
        super(name);
        this.tvr = new TrackVacancyRegister();
    }

    static build(arr) {
        return new Segment(arr);
    }
    
    possibleActions() {
        return this.tvr.possibleActions();
    }

    executeAction(text) {
        switch (text) {
            default:
                this.tvr.executeAction(text);
                break;
        }
    }

}

class Signal extends TopoElement { // futur zwerksignal
    constructor(arr) {
        const name = arr[0];
        super(name);
        this.imageShown = "stop"; // stop, warning, go 
    }

    origin() { return this.neighbors[0]; }

    goal() { return this.neighbors[1]; }

    possibleActions() {
        return [ "bring to halt" ];
    }

    executeAction(text) {
        switch (text) {
            case "bring to halt":
                this.bringToHalt();
                break;
            default:
                throw new Error("ERR14 unknow action");
                break;
        }
    }

    bringToHalt() {
        this.imageShown = "stop"; // stop, warning, go 
        // destroy the routes ?
    }
}

class Interlocking {
    constructor(constructionDocuments) {
        const switchIL = constructionDocuments[0];
        const nbSw = switchIL.length;
        this.switches = [];
        for (let i = 0; i < nbSw; i++) {
            this.switches.push(new Switch(switchIL[i]));
        }

        const segmentIL = constructionDocuments[1];
        const nbSeg = segmentIL.length;
        this.segments = [];
        for (let i = 0; i < nbSeg; i++) {
            this.segments.push(new Segment(segmentIL[i]));
        }

        const signalIL = constructionDocuments[2];
        const nbSig = signalIL.length;
        this.signals = [];
        for (let i = 0; i < nbSig; i++) {
            this.signals.push(new Signal(signalIL[i]));
        }        

        const connexionsIL = constructionDocuments[3];
        const nbCon = connexionsIL.length;
        for (let i = 0; i < nbCon; i++) {
            const topoElName = connexionsIL[i][0];
            const topoEl = this.findTopoEl(topoElName); // exeptions i undefined ?
            const topoElNeiList = connexionsIL[i][1];
            const nbNei = topoElNeiList.length
            for (let j = 0; j < nbNei; j++) {                
                topoEl.neighbors.push(this.findTopoEl(topoElNeiList[j]));
            }
        }

        this.routes = [];
    }
    
    findTopoEl(name) {
        for (const array of [this.switches, this.segments, this.signals]) {
            const found = array.find(item => item.name === name);
            if (found) {
                return found;
            }
        }
        return undefined;
    }
}

class PolecatElement {
    constructor(stw_el, polecat_parent, x, y) {
        this.stw_el = stw_el;
        stw_el.graphical_rep = this;
        this.polecat_parent = polecat_parent;
        if (typeof x != "number" || typeof y != "number") { throw new Error("ERR0 value must be a number"); }
        if (x <=0 || y<=0) { throw new Error("ERR1 values must be positive"); }        
        this.x = x;
        this.y = y;
        this.actionSelectionMode = { active:false, list:[] };
    }
    
    static createFromStwEl(stw_el, ctx, init_arr) {
        switch(stw_el.constructor.name) {
        case "Switch":
            return new PolecatSwitch(stw_el, ctx, init_arr);
        case "Segment":
            return new PolecatSegment(stw_el, ctx, init_arr);
        case "Signal":
            return new PolecatSignal(stw_el, ctx, init_arr);
        default:
            throw new Error("ERR3 non valid type");   
        }
    }

    validate_dir_input(dir) {
        // const allowed_directions = [ "N", "NE", "E", "SE", "S", "SW", "W", "NW" ];
        const allowed_directions = [ "NE", "E", "SE", "SW", "W", "NW" ];
        const dir_not_allowed = (-1==allowed_directions.indexOf(dir))
        if (dir_not_allowed) { throw new Error("ERR2 dir not allowed"); }
    }

    get ctx() { return this.polecat_parent.ctx; }

    trackColor() {
        switch(this.stw_el.tvr.state) {
            case "occupied":
                return "red";
            case "vacant":
                if (this.stw_el.locked) {
                    return "blue";
                } else {
                    return "black"
                }
            case "disturbed":
                return "magenta";
            default: throw new Error("ERR10 incorrect tvr state");
        }
    }

    dirXSign(dir) {
        switch(dir.slice(-1)) {
        // switch(dir.charAt(0)) {
            case "W":
                return -1;
            case "E":
                return 1; 
            default:
                throw new Error("ERR6 incorrect dir");   
        }
    }

    dirYSign(dir) {
        if(dir.length==1) {
            return 0;
        } else {
            switch(dir.charAt(0)) {
                case "N":
                    return -1;
                case "S":
                    return 1; 
                default:
                    throw new Error("ERR7 incorrect dir");   
            }
        }
    }

    midCoord() {
        const unit_len = this.polecat_parent.unit_len;
        const half_unit = (unit_len-1)*0.5+1;
        const x_mid = (this.x-1)*unit_len+half_unit;
        const y_mid = (this.y-1)*unit_len+half_unit;
        return [x_mid, y_mid];
    }

    edgeCoord(dir) {
        const unit_len = this.polecat_parent.unit_len;
        const half_unit = (unit_len-1)*0.5+1;

        const [x_mid, y_mid] = this.midCoord();

        const dir_x = this.dirXSign(dir);
        const dir_y = this.dirYSign(dir);
        const x_edge = x_mid+dir_x*half_unit;
        const y_edge = y_mid+dir_y*half_unit;
        
        return [x_edge, y_edge];
    }

    isClicked(click_x, click_y) {
        const unit_len = this.polecat_parent.unit_len;
        const my_top = (this.y-1)*unit_len;
        const my_bottom = this.y*unit_len;
        const my_left = (this.x-1)*unit_len;
        const my_right = this.x*unit_len;
        let clicked = true;
        if ( (my_bottom<click_y) || (click_y<my_top) || (my_right<click_x) || (click_x<my_left) ) {
            clicked = false;
        }
        return clicked;
    }

    activateActionSelectionMode() {
        this.actionSelectionMode = { active:true, list:this.stw_el.possibleActions() };
    }

    deactivateActionSelectionMode() {
        this.actionSelectionMode = { active:false, list:[] };
    }

    actionIsClicked(click_x, click_y) {
        const unit_len = this.unit_len();
        const actionMenuLeft = (this.x-1)*unit_len;
        const actionMenuRight = this.x*unit_len;
        
        if ( (actionMenuLeft<click_x) && (click_x<actionMenuRight) ) {
            let notFound = true;
            const actions = this.actionSelectionMode.list; // using the list saved when originally displayed, not the current situation which may have changed
            let rowPxHeight = this.actionSelectionMenuRowHeight(actions);
    
            let actionMenuTop = (this.y-1)*unit_len;
            let actionMenuBottom = actionMenuTop+rowPxHeight;
            for (let i = 0; (i < actions.length) && notFound; i++) {
                actionMenuTop += rowPxHeight;
                actionMenuBottom += rowPxHeight;
                if ( (actionMenuTop<click_y) && (click_y<actionMenuBottom) ) {
                    this.stw_el.executeAction(actions[i]);
                    notFound = false;
                }
            }
        }
        this.deactivateActionSelectionMode();
    }

    unit_len() {
        return this.polecat_parent.unit_len;
    }

    actionSelectionMenuRowHeight(actions) {
        const nbRows = 1 + actions.length; // 1rst row is the name;
        let rowPxHeight = Math.floor(this.unit_len()/nbRows);
        if (rowPxHeight<1) {
            rowPxHeight = 1;
        } else if (rowPxHeight > 20) {
            rowPxHeight = 20;
        }
        return rowPxHeight;
    }

    drawActionSelection () {
        const ctx = this.ctx;
        const actions = this.actionSelectionMode.list;
        const unit_len = this.unit_len();

        // ctx.fillStyle = "red";
        // ctx.fillRect((this.x-1)*unit_len, (this.y-1)*unit_len, unit_len, unit_len);

        let rowPxHeight = this.actionSelectionMenuRowHeight(actions);

        const textPxHeight = rowPxHeight.toString();
        
        const xText = (this.x-1)*unit_len;
        let yText = (this.y-1)*unit_len+rowPxHeight*0.8;
        const xRect = (this.x-1)*unit_len;
        let yRect = (this.y-1)*unit_len;
        
        ctx.fillStyle = "blue";
        ctx.fillRect(xRect, yRect, unit_len, rowPxHeight);
        ctx.fillStyle = "black";        
        ctx.font = "bold italic "+textPxHeight+"px Arial";
        ctx.fillText(this.stw_el.name, xText, yText, unit_len);
        ctx.font = textPxHeight+"px Arial";
        
        const rectColors = ["rgb(100 100 100)", "rgb(200 200 200)"];
        for (let i = 0; i < actions.length; i++) {
            yText += rowPxHeight;
            yRect += rowPxHeight;
            
            ctx.fillStyle = rectColors[i%2];
            ctx.fillRect(xRect, yRect, unit_len, rowPxHeight);
            ctx.fillStyle = "black";        
            ctx.fillText(actions[i], xText, yText, unit_len);
        }

        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.strokeRect((this.x-1)*unit_len, (this.y-1)*unit_len, unit_len, unit_len);

    }
}

class PolecatSwitch extends PolecatElement {
    constructor(stw_el, polecat_parent, init_arr) {
        const x = init_arr[0];
        const y = init_arr[1];
        const tip = init_arr[2];
        const left = init_arr[3];
        const right = init_arr[4];
        
        super(stw_el, polecat_parent, x, y);
        this.validate_dir_input(tip);
        this.validate_dir_input(left);
        this.validate_dir_input(right);
        if((tip.slice(-1)==left.slice(-1)) || (tip.slice(-1)==right.slice(-1))) { throw new Error("ERR5 the legs cannot be on the same side as the tip"); }

        this.tip = tip;
        this.left = left;
        this.right = right;
    }

    drawBranch(dir, partially) { // partially [boolean]
        const ctx = this.ctx;
        const [x_mid, y_mid] = this.midCoord();
        const [x_edge, y_edge] = this.edgeCoord(dir);

        let x_start, y_start;

        if (partially) {
            x_start = Math.floor(0.5*(x_mid+x_edge));
            y_start = Math.floor(0.5*(y_mid+y_edge));
        } else {
            x_start = x_mid;
            y_start =  y_mid;
        }
        ctx.beginPath();
        ctx.moveTo(x_start, y_start);
        ctx.lineTo(x_edge, y_edge);
        ctx.stroke();
    }

    draw() {
        if (this.actionSelectionMode.active) {
            this.drawActionSelection();
        } else {
            const ctx = this.ctx;
            const col = this.trackColor(); // nomally if the other unused branch has the color of its neighbor                
            ctx.strokeStyle = col;
            ctx.lineWidth = 1;
    
            this.drawBranch(this.tip, false);
    
            switch(this.stw_el.position) {
                case "left":
                    this.drawBranch(this.left, false);
                    this.drawBranch(this.right, true);
                    break;
                case "right":
                    this.drawBranch(this.left, true);
                    this.drawBranch(this.right, false);
                    break;
                default:
                    throw new Error("ERR9 invalid position");                
            }
        }
    }
}

class Polecat2SidedElement extends PolecatElement {
    constructor(stw_el, polecat_parent, init_arr) {
        const x = init_arr[0];
        const y = init_arr[1];
        const side1 = init_arr[2]
        const side2 = init_arr[3]

        super(stw_el, polecat_parent, x, y);
        this.validate_dir_input(side1);
        this.validate_dir_input(side2);
        if(side1.slice(-1)==side2.slice(-1)) { throw new Error("ERR4 the 2 extremities must be on opposite sides"); }
        this.side1 = side1;
        this.side2 = side2;
    }

    intermediateCoord(dir) {
        const unit_len = this.polecat_parent.unit_len;
        const middle_line_len = Math.floor(unit_len*0.15);

        const [x_mid, y_mid] = this.midCoord();
        const dir_x = this.dirXSign(dir);
        return [ x_mid+dir_x*middle_line_len, y_mid ];
    }

    drawHalf(side, color) {
        const ctx = this.ctx;
        
        const [x_mid, y_mid] = this.midCoord();
        const [x_intermediate, y_intermediate] = this.intermediateCoord(side);
        const [x_edge, y_edge] = this.edgeCoord(side);
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x_mid, y_mid);
        ctx.lineTo(x_intermediate, y_intermediate);
        ctx.lineTo(x_edge, y_edge);
        ctx.stroke();
    }

    draw(color_1, color_2) {
        this.drawHalf(this.side1, color_1);
        this.drawHalf(this.side2, color_2);
    }
}

class PolecatSegment extends Polecat2SidedElement {
    constructor(stw_el, polecat_parent, init_arr) {
        super(stw_el, polecat_parent, init_arr);
    }

    draw() {
        if (this.actionSelectionMode.active) {
            this.drawActionSelection();
        } else {
            const color = this.trackColor();
            super.draw(color, color);
        }
    }
}

class PolecatSignal extends Polecat2SidedElement {
    constructor(stw_el, polecat_parent, init_arr) {
        super(stw_el, polecat_parent, init_arr);
    }

    signalCoords() {        
        const unit_len = this.polecat_parent.unit_len;
        const offset = Math.floor(unit_len*0.1);

        const y_sign = this.dirXSign(this.side1);

        let [ x_int, y_int ] = this.intermediateCoord(this.side1);
        const x_1 = x_int;
        const y_1 = y_int + y_sign*offset;

        [ x_int, y_int ] = this.intermediateCoord(this.side2);
        const x_2 = x_int;
        const y_2 = y_int + y_sign*offset;

        [ x_int, y_int ] = this.midCoord();
        const x_3 = x_int;
        const y_3 = y_int + 2*y_sign*offset;

        return [ x_1, y_1, x_2, y_2, x_3, y_3 ];
    }

    signalColor() {
        switch(this.stw_el.imageShown) {
            case "stop": return "red";
            case "warning": return "orange";
            case "go": return "green";
            default: throw new Error("ERR8 invalid imageShown");
        }
    }

    draw() {
        if (this.actionSelectionMode.active) {
            this.drawActionSelection();
        } else {
            let col = this.stw_el.origin().graphical_rep.trackColor();
            this.drawHalf(this.side1, col);
            col = this.stw_el.goal().graphical_rep.trackColor();
            this.drawHalf(this.side2, col)

            col = this.signalColor();
            const [ x_1, y_1, x_2, y_2, x_3, y_3 ] = this.signalCoords();
            this.ctx.strokeStyle = col;
            this.ctx.beginPath();
            this.ctx.moveTo(x_1, y_1);
            this.ctx.lineTo(x_2, y_2);
            this.ctx.lineTo(x_3, y_3);
            this.ctx.stroke();
        }
    }
}

class Polecat {
    constructor(stw, BU_graph) {
        
        this.graph_elements = [];
        BU_graph.forEach(el => {
            const stw_el = stw.findTopoEl(el[0]);
            const new_polecat_el = PolecatElement.createFromStwEl(stw_el, this, el.slice(1)); // slice takes subarray, excluding first number
            this.graph_elements.push(new_polecat_el); 
        });

        this.canvas = document.getElementById("graphicCanvas");
        this.ctx = this.canvas.getContext("2d");
        this.ctx.lineWidth = 5;

        this.unit_len = 99; // One unit is 99 pixels. Code is meant to use odd number.

        this.actionSelectionMode = { active:false, element:null } ;

        this.setTotalWidthHeigth();
        this.drawElements();

        this.setupEventListeners();
    }
    
    setTotalWidthHeigth() {
        let max_col = 0;
        let max_row = 0;
        this.graph_elements.forEach(el => {
            if (el.x>max_col) { max_col = el.x; }
            if (el.y>max_row) { max_row = el.y; }
        });
        this.canvas.setAttribute("width", this.unit_len*max_col);
        this.canvas.setAttribute("height", this.unit_len*max_row);
    }

    drawElements() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); // hope this works
        this.graph_elements.forEach(el => {
            el.draw();
        });
    }

    setupEventListeners() { // TODO *** finish implementation
        window.addEventListener('mousedown', function (event) {
            musterLuppe.actionSelectionMouseDown(event, false);
        })
        window.addEventListener('mouseup', function (event) {
            musterLuppe.actionSelectionMouseUp(event, false);
        })
        window.addEventListener('touchstart', function (event) {
            musterLuppe.actionSelectionMouseDown(event, true);
        })
        window.addEventListener('touchend', function (event) {
            musterLuppe.actionSelectionMouseUp(event, true);
        })
    }

    get_click_canvas_coord(event, touchNotMouse) {
        let clientX;
        let clientY;
        if(touchNotMouse) {
            clientX = event.changedTouches[0].clientX;
            clientY = event.changedTouches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }
        const rect_ = this.canvas.getBoundingClientRect()
        const x = clientX - rect_.left
        const y = clientY - rect_.top
            return [x, y];
    }

    actionSelectionMouseDown(event, touchNotMouse) {
        const [x, y] = this.get_click_canvas_coord(event, touchNotMouse);
        let notFound = true;
        for (let i = 0; (i < this.graph_elements.length) && notFound; i++) {
            if (this.graph_elements[i].isClicked(x,y)) {
                // this.graph_elements[i].actionSelectionModeOn = true;
                this.graph_elements[i].activateActionSelectionMode();
                this.actionSelectionMode = { active:true, element:this.graph_elements[i] }
                // this.actionSelectionMode = true;
                notFound = false;
            }
        }
        if(!notFound) {
            this.drawElements(); // this will draw the actions selection menu
        }
    }

    actionSelectionMouseUp(event, touchNotMouse) {
        if (this.actionSelectionMode.active) {
            const [x, y] = this.get_click_canvas_coord(event, touchNotMouse);
            this.actionSelectionMode.element.actionIsClicked(x, y);
            this.actionSelectionMode = { active:false, element:null }
            this.drawElements(); // this will draw the actions selection menu
        }
    }
    
    // get ctx() { return this.ctx; }
}


constructionDocuments = [
    [ // Switches
        ["W1"],
        ["W2"]
    ],
    [ // Segments
        ["G12"],
        ["G1"],
        ["G2"],
        ["G92"]
    ],
    [ // Signals
        ["Z12A"],
        ["Z1B"],
        ["Z1A"],
        ["Z2B"],
        ["Z2A"],
        ["Z92B"]
    ],
    [ // Topologie, neighbors
        ["W1", "Z2B"],
        ["W2", ["Z92B", "Z2A", "Z1A"]],
        ["G12", ["Z12A", "G92"]],
        ["G1", ["Z1A", "Z1B"]],
        ["G2", ["Z2A", "Z2B"]],
        ["G92", ["Z92B", "G12"]],
        ["Z12A", ["G12", "W1"]],
        ["Z1B", ["G1", "W1"]],
        ["Z1A", ["G1", "W2"]],
        ["Z2B", ["G2", "W1"]],
        ["Z2A", ["G2", "W2"]],
        ["Z92B", ["G92", "W2"]],
    ]  
];

polecatCD = [ // Graphic representation
    ["W1", 3, 2, "W", "NE", "E"],
    ["W2", 7, 2, "E", "W", "NW"],
    ["G12", 1, 2, "W", "E"],
    ["G1", 5, 1, "W", "E"],
    ["G2", 5, 2, "W", "E"],
    ["G92", 9, 2, "W", "E"],
    ["Z12A", 2, 2, "W", "E"],
    ["Z1B", 4, 1, "E", "SW"],
    ["Z1A", 6, 1, "W", "SE"],
    ["Z2B", 4, 2, "E", "W"],
    ["Z2A", 6, 2, "W", "E"],
    ["Z92B", 8, 2, "E", "W"],
];

const musterStw = new Interlocking(constructionDocuments);
const musterLuppe = new Polecat(musterStw, polecatCD);
console.log(musterStw);
console.log(musterLuppe);

// const canvas = document.getElementById("graphicCanvas");
// const ctx = canvas.getContext("2d");
// ctx.fillStyle = "red";
// ctx.fillRect(0, 0, 150, 75);

// ctx.beginPath();
// ctx.moveTo(0, 0);
// ctx.lineTo(200, 100);
// ctx.lineTo(175,100);
// ctx.stroke();

// ctx.beginPath();
// ctx.arc(95, 50, 40, 0, 2 * Math.PI);
// ctx.stroke();

// ctx.beginPath();
// ctx.moveTo(50,0);
// ctx.lineTo(175,75);
// ctx.lineWidth = 5;
// ctx.strokeStyle = "green";
// ctx.lineCap = "round"; // ("butt", "round" or "square").
// ctx.stroke();

// ctx.strokeStyle = "rgb(0 255 255 / 50%)";
// ctx.lineWidth = 5;
// ctx.strokeRect(10,10, 100,100);