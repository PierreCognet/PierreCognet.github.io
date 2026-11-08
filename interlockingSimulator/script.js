const TAP_SLOP   = 12;    // px of finger movement still counted as a tap
const TAP_MAX_MS = 700;   // longer than this is a press-and-hold, not a tap

class TrackVacancyRegister {
    constructor() {
        this.state = "vacant"; // vacant, occupied or faulty
    }

    possibleActions() {
        return [ "toggle occupation" ];
    }

    executeAction(text) {
        switch(text) {
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
        // add other cases like faulty, etc
    }

    isVacant() { return this.state=="vacant"; }

}

class Route {
    constructor(start_to_finish_topo_el) {
        this.start_to_finish_topo_el = start_to_finish_topo_el;
        this.flanckProtectionStatus = Array(start_to_finish_topo_el.length).fill("uninitialized");
        this.status = "initialised"; // "initializing", "permitted", "violated"          // To implement : add states, initializing, locked, correctly oriented, ready, signals show green, train started riding, disrupted

    }

    //    reserveElements() {
    //        for (let i=0; i < this.start_to_finish_topo_el.length; i++) { 
    //            this.start_to_finish_topo_el[i].reserve(this);
    //        }
    //        // this.status = "reserved";
    //    }

    readyRoute() {
        this.reserveAndOrientElements();
        this.protectFlanck();
        this.fireSignals();
        this.status = "permitted";
    }

    reserveAndOrientElements() {
        // To implement, treat the case of start and end signal better ?
        this.start_to_finish_topo_el[0].reserveAndOrientStartToEnd(this, this.start_to_finish_topo_el[0].getOrigin(), this.start_to_finish_topo_el[0].getGoal());
        this.start_to_finish_topo_el.at(-1).reserveAndOrientStartToEnd(this, this.start_to_finish_topo_el.at(-1).getOrigin(), this.start_to_finish_topo_el.at(-1).getGoal());

        for (let i=1; i < this.start_to_finish_topo_el.length-1; i++) {
            this.start_to_finish_topo_el[i].reserveAndOrientStartToEnd(this, this.start_to_finish_topo_el[i-1], this.start_to_finish_topo_el[i+1]);
        }
        // this.status = "oriented";
    }

    protectFlanck() {
        for (let i=0; i < this.start_to_finish_topo_el.length; i++) {
            this.flanckProtectionStatus[i] = this.start_to_finish_topo_el[i].protectFlanck();
            if(this.flanckProtectionStatus[i]!="weak" && this.flanckProtectionStatus[i]!="strong") {
                throw new Error("An element couldn't protect flanck."); // To implement: not a problem if couldn't for shunting routes. or waits for the protection to come.
            }
        }
    }

    fireSignals() {
        let prevSignalCanShow = undefined;
        let nextNeiInRouDir = undefined;
        for (let i = this.start_to_finish_topo_el.length - 1; i >= 0; i--) {
            prevSignalCanShow = this.start_to_finish_topo_el[i].shunRouSignalImageAlgo(prevSignalCanShow, nextNeiInRouDir);
            nextNeiInRouDir = this.start_to_finish_topo_el[i];
        }
    }

    // Add route types ? shunting, train -> to let flanckenschutz know the type of priority to give it. 
}

class TopoElement {
    constructor(itlk, name) {
        this.itlk = itlk;
        this.name = name;
        this.reserved = null; // Reserved by a shunting route. Rangierfahsrtassen Verschluss. Value : "null" or reference to the Route.
        this.flanckProtectionRequests = []; // To implement : list of all current neighbors asking for flank protection. [ {neighbor:xxx, route:yyy}, {neighbor:zzz, route:aaa}  ]  all elements should have flankSurveillance parameter. An object that points the the route asking the protection, the neighbor who requested protection.
        this.graphical_rep = undefined;
    }

    isReserved() { return !(this.reserved === null); }
    
    reserve(route) {
        if (!(this.reserved === null)) {
            throw new Error("ERR26 topoElements is already reserved by another route.");
        }
        this.reserved = route;
    }

    neighorsbWhenCommingFrom(origin) { throw new Error("ERR16 all topoElements must implement this function."); }

    trackVacancySuitableForRoute() { throw new Error("ERR24 all topoElements must implement this function."); }
    trackVacancySuitableForRoute_elementWithTVR() {
        return this.tvr.isVacant(); // Anything other than "vacant" is unsuitable. (occupied, faulty, etc)
    }

    reserveAndOrientStartToEnd(route, startNeighbor, endNeighbor) { throw new Error("ERR27 all topoElements must implement this function."); }

    protectFlanck() { throw new Error("ERR32 all topoElements must implement this function."); } // For now, no parameters needed. Suppose that the route is already locked. Returns if successful or not.
    protectFlanck_2NeighboredElement() {
        return "strong"; // Do nothing. The element is a track segment or a signal, etc.
    }

    requestFlanckProtection(requester, route) { throw new Error("ERR35 all topoElements must implement this function."); } // Returns, "none", "weak" or "strong".

    possibleActions() { throw new Error("TopoElements must implement this function."); } // All commands that can be given to this element from the polecat interface. 

    shunRouSignalImageAlgo(imageToShow, nextNeiInRouDir) { throw new Error("TopoElements must implement this function."); } // The algorithm to fire signals of a shunting. Returns the image allowed for preceding signal. 1rst paremeter taken is the image that the signal can show. 2nd parameter is to ignore signals in the wrong direction.
    shunRouSignalImageAlgo_tvr(imageToShow) {
        if (this.tvr.isVacant()) {
            return imageToShow; // pass on the image without modifying it
        } else {
            return "warning"; // the preceding signal must show warning because track is occupied
        }
    }
}

class Switch extends TopoElement {
    constructor(itlk, name) {
        super(itlk, name);
        this.position = "left"; // left, right, unknown, heeled
        this.tvr = new TrackVacancyRegister();
        this.reservedDesiredPosition = null;
    }
    
    // static build(itlk, arr) {
    //     return new Switch(itlk, arr);
    // }

    setTip(topoEl) { this.tip = topoEl; }
    getTip() { return this.tip; }
    setLeft(topoEl) { this.left = topoEl; }
    getLeft() { return this.left; }
    setRight(topoEl) { this.right = topoEl; }
    getRight() { return this.right; }

    whoIsThisNeighbor(topo_el) {
        if (topo_el===this.getTip()) { return "tip"; }
        else if (topo_el===this.getLeft()) { return "left"; }
        else if (topo_el===this.getRight()) { return "right"; }
        else { throw new Error("Not a neighbor."); }
    }

    isNormalState() { return (this.position=="left" || this.position=="right"); }

    possibleActions() {
        const switch_arr = [ "turn switch" ]; // "force turn switch"
        return switch_arr.concat(this.tvr.possibleActions());
    }

    neighorsbWhenCommingFrom(origin) {
        if (origin===this.getTip()) {
            return [ this.getLeft(), this.getRight() ];
        } else if (origin===this.getLeft() || origin===this.getRight()) {
            return [ this.getTip() ];
        } else {
            throw new Error("ERR21 The input given should be one of the two neighbors.");
        }
    }

    trackVacancySuitableForRoute() { return this.trackVacancySuitableForRoute_elementWithTVR(); }

    reserveAndOrientStartToEnd(route, startNeighbor, endNeighbor) {
        this.reserve(route);

        let branchNeighbor;
        if (startNeighbor===this.getTip()) { branchNeighbor = endNeighbor; }
        else if (endNeighbor===this.getTip()) { branchNeighbor = startNeighbor; }
        else { throw new Error("ERR28 one of the neighbors should be the tip"); }

        if (this.isNormalState()) {

            // let desiredPosition;
            if (branchNeighbor===this.getLeft()) { this.reservedDesiredPosition = "left"; }
            else if (branchNeighbor===this.getRight()) { this.reservedDesiredPosition = "right"; }
            else { throw new Error("ERR29 one of the neighbors should be a branch"); }

            this.tryToTurnSwitchTo(this.reservedDesiredPosition);

            // if (this.position!=this.reservedDesiredPosition) { this.tryToTurnSwitch(); }
            // if (this.position!=desiredPosition) { throw new Error("ERR30 Failed to turn switch to desired position."); }

        } else {
            throw new Error("ERR31 switch not in normal state (is faulty).");
        }
    }

    protectFlanck() {
        // To implement : make a better implementation where a weiche remembers that it was asked to give flankenschutz but couldnt because was in the einzelverschluss, so passed on the protection request further. When the einzelverschluss is removed, it can turn to flankenschutz position and retire the elements further that were doing flankenschutz.
        let flanckProtectionRequestNeighbor;
        if (this.position=="left") { flanckProtectionRequestNeighbor = this.getRight(); }
        else if (this.position=="right") { flanckProtectionRequestNeighbor = this.getLeft(); }
        else { throw new Error("ERR33 this switch isn't in a defined position."); }

        if (this.isReserved()) {
            return flanckProtectionRequestNeighbor.requestFlanckProtection(this, this.reserved);
        } else {
            throw new Error("ERR34 the switch must be reserved by a route to demand flanck protection.");
        }
    }

    requestFlanckProtection(requester, route) { 
        let fpr = {neighbor:requester, route:route} // flanck protection request
        this.flanckProtectionRequests.push(fpr);

        if (requester===this.getTip()) {
            if (this.tvr.isVacant()){
                fpr.vacancySurpervised = true;

                let fp_left = this.getLeft().requestFlanckProtection(this, route);
                let fp_right = this.getRight().requestFlanckProtection(this, route);
                
                if (fp_left=="none" || fp_right=="none") { return "none"; }
                else if (fp_left=="weak" || fp_right=="weak") { return "weak"; }
                else if (fp_left=="strong" && fp_right=="strong") { return "strong"; }
                else { throw new Error("ERR42 the flanck protections have unexpected value."); }
            } else {
                return "none";
            }
        } else {
            if (requester===this.getLeft()) { fpr.desiredPosition = "right"; }
            else if (requester===this.getRight()) { fpr.desiredPosition = "left"; }
            else { throw new Error("ERR40 the requester is not a neighbor"); }

            if (this.position==fpr.desiredPosition) { 
                return "strong";
            }

            this.tryToTurnSwitchTo(fpr.desiredPosition);

            if (this.position==fpr.desiredPosition) { 
                return "strong"; // Doesn't need to be vacant the switch is in protecting position. A train could be passing on it.
            } else if (this.isNormalState()) {
                if (this.tvr.isVacant()){
                    fpr.vacancySurpervised = true;
                    return this.getTip().requestFlanckProtection(this, route); // The desired flanck protection position is saved, but for now we look for protection further.
                } else {
                    return "none"; // Switch is positionned towards route and is occupied, so isn't protecting flanck.
                }
            } else {
                return "none"; // Faulty, etc.
            }
        }
    }

    executeAction(text) {
        switch(text) {
            case "turn switch":
                this.tryToTurnSwitch(true);
                break;
            default:
                this.tvr.executeAction(text);
                break;
        }
    }

    tryToTurnSwitch(throwErrIfCant=false) {
        let desiredPos;
        if (this.position=="left") { desiredPos = "right"; }
        else if (this.position=="right") { desiredPos = "left"; }
        else { throw new Error("ERR12 unknown position"); }
        this.tryToTurnSwitchTo(desiredPos, throwErrIfCant);
    }

    tryToTurnSwitchTo(desiredPos, throwErrIfCant=false) { // Refuse to turn if reserved in route or locked for flank protection or if occupied.

        if (desiredPos!="left" && desiredPos!="right") { throw new Error("ERR45 incorrect input"); }

        if (desiredPos!=this.position) {
            if (!this.tvr.isVacant()) { 
                if (throwErrIfCant) { throw new Error("Cannot turn switch " + this.name + " because it is occupied."); }
                else { return; }
            }
            
            if (this.reservedDesiredPosition!==null && this.reservedDesiredPosition!=desiredPos) {
                if (throwErrIfCant) { throw new Error("Cannot turn switch " + this.name + " because it is reserved in a route."); }
                else { return; }
            }

            for (let i = 0; i < this.flanckProtectionRequests.length; i++) {
                if (this.flanckProtectionRequests[i].desiredPosition!=desiredPos) {
                    if (throwErrIfCant) { throw new Error("Cannot turn switch " + this.name + " because it is protecting flank of a route."); }
                    else { return; }
                }
            }
            this.position = desiredPos;
        }
        // Else do nothing, the switch is already in the correct posistion.
    }

    shunRouSignalImageAlgo(imageToShow, nextNeiInRouDir) {
        return this.shunRouSignalImageAlgo_tvr(imageToShow);
    }
}

class Segment extends TopoElement {
    constructor(itlk, name) {
        super(itlk, name);
        this.tvr = new TrackVacancyRegister();
    }

    setNeighbors(topoEl1, topoEl2) { this.neighbors = [ topoEl1, topoEl2]; }
    getNeighbors() { return this.neighbors; }

    neighorsbWhenCommingFrom(origin) {
        return [ this.oppositeNeighbor(origin) ];
    }

    oppositeNeighbor(neighbor) {
        if (neighbor===this.getNeighbors()[0]) {
            return this.getNeighbors()[1];
        } else if (neighbor===this.getNeighbors()[1]) {
            return this.getNeighbors()[0];
        } else {
            throw new Error("ERR38 The input given should be one of the two neighbors.");
        }
    }

    trackVacancySuitableForRoute() { return this.trackVacancySuitableForRoute_elementWithTVR(); }

    reserveAndOrientStartToEnd(route, startNeighbor, endNeighbor) { this.reserve(route); }
    
    protectFlanck() { return this.protectFlanck_2NeighboredElement(); }
    
    requestFlanckProtection(requester, route) {
        this.flanckProtectionRequests.push({neighbor:requester, route:route});
        if (this.tvr.isVacant()){
            return this.oppositeNeighbor(requester).requestFlanckProtection(this, route);
        } else {
            return "none";
        }
    }

    possibleActions() {
        return this.tvr.possibleActions();
    }

    executeAction(text) {
        switch(text) {
            default:
                this.tvr.executeAction(text);
                break;
        }
    }

    shunRouSignalImageAlgo(imageToShow, nextNeiInRouDir) {
        return this.shunRouSignalImageAlgo_tvr(imageToShow);
    }
}

class Signal extends TopoElement { // futur zwergsignal
    constructor(itlk, name) {
        super(itlk, name);
        this.imageShown = "stop"; // stop, warning, go 
    }

    setOrigin(topoEl) { this.origin = topoEl; }
    getOrigin() { return this.origin; }

    setGoal(topoEl) { this.goal = topoEl; }
    getGoal() { return this.goal; }

    possibleActions() {
        return [ "bring to halt", "start shunting route" ];
    }

    executeAction(text) {
        switch(text) {
            case "bring to halt":
                this.bringToHalt();
                break;
            default:
                throw new Error("ERR14 unknow action");
                break;
        }
    }

    neighorsbWhenCommingFrom(origin) {
        if (origin===this.getOrigin()) {
            return [ this.getGoal() ];
        } else if (origin===this.getGoal()) {
            return [ this.getOrigin() ];
        } else {
            throw new Error("ERR19 The input given should be one of the two neighbors.");
        }
    }

    trackVacancySuitableForRoute() { return true; }

    reserveAndOrientStartToEnd(route, startNeighbor, endNeighbor) { this.reserve(route); }

    protectFlanck() { return this.protectFlanck_2NeighboredElement(); }
    
    requestFlanckProtection(requester, route) {
        this.flanckProtectionRequests.push({neighbor:requester, route:route});
        if (requester===this.getOrigin()) {
            return this.getGoal().requestFlanckProtection(this, route);
        } else if (requester===this.getGoal()) {
            if (this.imageShown=="stop") {
                return "weak";
            } else {
                return "none";
            }
        } else {
            throw new Error("ERR39 The input given should be one of the two neighbors.");
        }
    }

    bringToHalt() {
        this.imageShown = "stop"; // stop, warning, go 
        // To implement: bringing to halt needs to change the state of the route (to deranged or violated or something) destroy the routes ?
    }

    shunRouSignalImageAlgo(imageToShow, nextNeiInRouDir) {
        if (imageToShow===undefined) { // this is the first iteration of the algorithm, so on the end signal, read its current imageShown, and pass on the improved image.
            if (this.imageShown=="stop") {
                return "warning";
            } else if (this.imageShown=="warning" || this.imageShown=="go") {
                return "go";
            } else {
                throw new Error("unexpected value");
            }
        } else if (imageToShow=="warning" || imageToShow=="go") {
            if (nextNeiInRouDir==this.getGoal()) {
                this.imageShown = imageToShow;
                return "go";
            } else {
                if (this.imageShown!="stop"){ throw new Error("an opposing signal isn't showing stop");  } // To implement: find a better place in the shunting route establishing algorithm to check this.
                return imageToShow; // do nothing, just pass on the value, the signal is in the opposite direction to the route
            }
        } else {
            throw new Error("unexpected value");
        }
    }
}

class Interlocking {
    constructor(constructionDocuments) {
        const switchIL = constructionDocuments[0];
        const nbSw = switchIL.length;
        this.switches = [];
        for (let i = 0; i < nbSw; i++) {
            this.switches.push(new Switch(this, switchIL[i][0]));
        }

        const segmentIL = constructionDocuments[1];
        const nbSeg = segmentIL.length;
        this.segments = [];
        for (let i = 0; i < nbSeg; i++) {
            this.segments.push(new Segment(this, segmentIL[i][0]));
        }

        const signalIL = constructionDocuments[2];
        const nbSig = signalIL.length;
        this.signals = [];
        for (let i = 0; i < nbSig; i++) {
            this.signals.push(new Signal(this, signalIL[i][0]));
        }        

        // Now that all elements are created, link them together.
        for (let i = 0; i < nbSw; i++) {
            this.switches[i].setTip(this.findTopoEl(switchIL[i][1])); // exeptions if undefined ?
            this.switches[i].setLeft(this.findTopoEl(switchIL[i][2])); // exeptions if undefined ?
            this.switches[i].setRight(this.findTopoEl(switchIL[i][3])); // exeptions if undefined ?
        }
        for (let i = 0; i < nbSeg; i++) {
            this.segments[i].setNeighbors( this.findTopoEl(segmentIL[i][1]), this.findTopoEl(segmentIL[i][2])); // exeptions if undefined ?
        }
        for (let i = 0; i < nbSig; i++) {
            this.signals[i].setOrigin(this.findTopoEl(signalIL[i][1])); // exeptions if undefined ?
            this.signals[i].setGoal(this.findTopoEl(signalIL[i][2])); // exeptions if undefined ?
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

    establishShuntingRoute(start, end) {
        // determine route end element from user -> this is the job of polecat, not the stw

        // find route path: element by element
        let visited_directed_segment = new Set();
        const retVal = this.recFuncFindPath(start, start.getGoal(), end, visited_directed_segment);
        const foundIt = retVal[0];
        if (!foundIt) { throw new Error("ERR22 couldn't find a path from start to end"); }
        const start_to_finish_topo_el = retVal[1].reverse();

        // Elements already locked in a route ?
        // Start signal cannot already be end of another shunting route.
        // End signal cannot already be start of a shunting route.
        // For now shunting routes are very seperate. Implement more complete routes later.
        for (let i=0; i < start_to_finish_topo_el.length; i++) { 
            if (start_to_finish_topo_el[i].isReserved()) {
                throw new Error("ERR23 an element of the route is already locked by another shunting route.");
            }
        }

        // To implement : Choose among the multiple possible routes. For now breath first search.

        // Tracks are vacant ? // not needed for shunting routes normally. Only Iltis does the check.
        for (let i=0; i < start_to_finish_topo_el.length; i++) { 
            if (!start_to_finish_topo_el[i].trackVacancySuitableForRoute()) {
                throw new Error("ERR25 an element of the route has unsuitable vacancy. For exemple, is occupied.");
            }
        }

        // Create route, lock elements.
        const r = new Route(start_to_finish_topo_el);
        this.routes.push(r);

        r.readyRoute();

        // throw new Error(not implemented) *** need to set all singals along the path to go or warning for the before last
        // throw new Error("ERR15 not implemented"); 

    }
    
    recFuncFindPath(prev, current, end, visited_directed_segment) { // Need to give it an empty set at the start "visited_directel_segment". Will return [false] or [true, [list of topo ele finish to start]].
        visited_directed_segment.add(prev.name + "->" + current.name);

        // To implement : the breath first search may find weird convoluted routes instead of the easier simpler route. try another algorith for smaller routes

        if (current===end && prev===end.getOrigin()) {
            return [ true , [ end, prev ] ];
        } else {
            let listNextTopoEleToSearch = current.neighorsbWhenCommingFrom(prev);
            for (const next of listNextTopoEleToSearch) {

                if (!visited_directed_segment.has(current.name + "->" + next.name)) {
                    const retVal = this.recFuncFindPath(current, next, end, visited_directed_segment);
                    const foundIt = retVal[0];
                    if (foundIt) {
                        retVal[1].push(prev);
                        return retVal;
                    }
                }
                // Else, continue searching other neighbors.
            }
            return [ false ]; // All neighbors have failed, go back a node.
        }
    }

}

class PolecatElement {
    constructor(topo_el, polecat_parent, x, y) {
        this.topo_el = topo_el;
        topo_el.graphical_rep = this;
        this.polecat_parent = polecat_parent;
        if (typeof x != "number" || typeof y != "number") { throw new Error("ERR0 value must be a number"); }
        if (x <=0 || y<=0) { throw new Error("ERR1 values must be positive"); }        
        this.x = x;
        this.y = y;
    }
    
    static createFromTopoEl(topo_el, polecat_parent, init_arr) {
        switch(topo_el.constructor.name) {
        case "Switch":
            return new PolecatSwitch(topo_el, polecat_parent, init_arr);
        case "Segment":
            return new PolecatSegment(topo_el, polecat_parent, init_arr);
        case "Signal":
            return new PolecatSignal(topo_el, polecat_parent, init_arr);
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
        switch(this.topo_el.tvr.state) {
            case "occupied":
                return "red";
            case "vacant":
                if (this.topo_el.isReserved()) {
                    return "blue";
                } else {
                    return "black"
                }
            case "faulty":
                return "magenta";
            default: throw new Error("ERR10 incorrect tvr state");
        }
    }

    trackColorForNeighbor(topo_el) {
        return this.trackColor(); // For most elements, the basic function is this one. The track color is the same for all neighbors asking.
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

    half_unit() {
        return (this.unit_len()-1)*0.5+1;
    }

    midCoord() {
        const unit_len = this.unit_len();
        const half_unit = this.half_unit();
        const x_mid = (this.x-1)*unit_len+half_unit;
        const y_mid = (this.y-1)*unit_len+half_unit;
        return [x_mid, y_mid];
    }

    edgeCoord(dir) {
        const unit_len = this.unit_len();
        const half_unit = this.half_unit();

        const [x_mid, y_mid] = this.midCoord();

        const dir_x = this.dirXSign(dir);
        const dir_y = this.dirYSign(dir);
        const x_edge = x_mid+dir_x*half_unit;
        const y_edge = y_mid+dir_y*half_unit;
        
        return [x_edge, y_edge];
    }

    isClicked(click_x, click_y) {
        const unit_len = this.unit_len();
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

    unit_len() {
        return this.polecat_parent.unit_len;
    }

    simpleExecuteAction(text) {
        this.polecat_parent.tryItlk(this.topo_el.name + ": " + text,
                                    () => this.topo_el.executeAction(text));
        // this.topo_el.executeAction(text);
    }

    drawReserved() { // Draw a bleu square if element is reserved in a route.
        if (this.topo_el.reserved!==null) {
            const half_unit = this.half_unit();
            const square_side_len = half_unit*0.1;
            const [x_mid, y_mid] = this.midCoord();
            const xRect = x_mid-square_side_len;
            const yRect = y_mid-0.5*half_unit;
            this.ctx.fillStyle = "blue";
            this.ctx.fillRect(xRect, yRect, square_side_len, square_side_len);
        }
    }

    drawFlanckProtecting() { // Draw a orange square if element has at least one flanck protection request.
        if (this.topo_el.flanckProtectionRequests.length>0) {
            const half_unit = this.half_unit();
            const square_side_len = half_unit*0.1;
            const [x_mid, y_mid] = this.midCoord();
            const xRect = x_mid+square_side_len;
            const yRect = y_mid-0.5*half_unit;
            this.ctx.fillStyle = "orange";
            this.ctx.fillRect(xRect, yRect, square_side_len, square_side_len);
        }
    }
}

class PolecatSwitch extends PolecatElement {
    constructor(topo_el, polecat_parent, init_arr) {
        const x = init_arr[0];
        const y = init_arr[1];
        const tip = init_arr[2];
        const left = init_arr[3];
        const right = init_arr[4];
        
        super(topo_el, polecat_parent, x, y);
        this.validate_dir_input(tip);
        this.validate_dir_input(left);
        this.validate_dir_input(right);
        if((tip.slice(-1)==left.slice(-1)) || (tip.slice(-1)==right.slice(-1))) { console.log(topo_el); console.log(init_arr); throw new Error("ERR5 the legs cannot be on the same side as the tip"); }

        this.tip = tip;
        this.left = left;
        this.right = right;
    }

    trackColorForNeighbor(topo_el) {
        const posi = this.topo_el.position;
        const nei_posi = this.topo_el.whoIsThisNeighbor(topo_el);
        
        if ((nei_posi=="left" && posi=="right") || (nei_posi=="right" && posi=="left")) {
            return "black";
        } else {
            return this.trackColor();
        }
    }

    drawBranch(dir, partially, color) { // partially [boolean]
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
        ctx.strokeStyle = color;    
        ctx.beginPath();
        ctx.moveTo(x_start, y_start);
        ctx.lineTo(x_edge, y_edge);
        ctx.stroke();
    }

    draw() {
        const ctx = this.ctx;
        const col = this.trackColor(); // nomally if the other unused branch has the color of its neighbor                
        ctx.lineWidth = 1;

        this.drawBranch(this.tip, false, col);

        switch(this.topo_el.position) {
            case "left":
                this.drawBranch(this.left, false, col);
                this.drawBranch(this.right, true, "black");
                break;
            case "right":
                this.drawBranch(this.left, true, "black");
                this.drawBranch(this.right, false, col);
                break;
            default:
                throw new Error("ERR9 invalid position");                
        }
        this.drawReserved();
        this.drawFlanckProtecting();
    }

    executeAction(text) {
        this.simpleExecuteAction(text);
    }
}

class Polecat2SidedElement extends PolecatElement {
    constructor(topo_el, polecat_parent, init_arr) {
        const x = init_arr[0];
        const y = init_arr[1];
        const side1 = init_arr[2]
        const side2 = init_arr[3]

        super(topo_el, polecat_parent, x, y);
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
    constructor(topo_el, polecat_parent, init_arr) {
        super(topo_el, polecat_parent, init_arr);
    }
    
    draw() {
        const color = this.trackColor();
        super.draw(color, color);

        this.drawReserved();
        this.drawFlanckProtecting();
    }

    executeAction(text) {
        this.simpleExecuteAction(text);
    }
}

class PolecatSignal extends Polecat2SidedElement {
    constructor(topo_el, polecat_parent, init_arr) {
        super(topo_el, polecat_parent, init_arr);
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
        switch(this.topo_el.imageShown) {
            case "stop": return "red";
            case "warning": return "orange";
            case "go": return "green";
            case "faulty": return "magenta";
            default: throw new Error("ERR8 invalid imageShown");
        }
    }

    draw() {
        let col = this.topo_el.getOrigin().graphical_rep.trackColorForNeighbor(this.topo_el);
        this.drawHalf(this.side1, col);
        col = this.topo_el.getGoal().graphical_rep.trackColorForNeighbor(this.topo_el);
        this.drawHalf(this.side2, col)

        col = this.signalColor();
        const [ x_1, y_1, x_2, y_2, x_3, y_3 ] = this.signalCoords();
        this.ctx.strokeStyle = col;
        this.ctx.beginPath();
        this.ctx.moveTo(x_1, y_1);
        this.ctx.lineTo(x_2, y_2);
        this.ctx.lineTo(x_3, y_3);
        this.ctx.stroke();

        this.drawReserved();
        this.drawFlanckProtecting();

        if (this.polecat_parent.currentMode.name=="shunting_route_end_selection" && this.polecat_parent.currentMode.start===this) {
            this.drawStartOfSelectionMode();
        }
    }

    drawStartOfSelectionMode() { // draw a bleu square contour around the element
        const half_unit = this.half_unit();
        const square_side_len = half_unit;
        const [x_mid, y_mid] = this.midCoord();
        const xRect = x_mid-half_unit*0.5;
        const yRect = y_mid-half_unit*0.5;
        this.ctx.strokeStyle = "blue";
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(xRect, yRect, square_side_len, square_side_len);
    }

    executeAction(text) {
        switch(text) {
            case "start shunting route":
                this.polecat_parent.currentMode = { name:"shunting_route_end_selection", start:this };
                break;
            default:
                this.simpleExecuteAction(text);
                break;
        }
    }
}

class Polecat {
    constructor(itlk, BU_graph) {
        this.itlk = itlk;
        this.graph_elements = [];
        BU_graph.forEach(el => {
            const topo_el = itlk.findTopoEl(el[0]);
            const new_polecat_el = PolecatElement.createFromTopoEl(topo_el, this, el.slice(1)); // slice takes subarray, excluding first number
            this.graph_elements.push(new_polecat_el); 
        });

        this.canvas = document.getElementById("graphicCanvas");
        this.ctx = this.canvas.getContext("2d");
        this.ctx.lineWidth = 5;

        this.unit_len = 99; // One unit is 99 pixels. Code is meant to use odd number.

        this.currentMode = { name:"simple_visualisation" }; // simple_visualisation, single_element_action_selection, shunting_route_end_selection   // delete the now useless single_action_election_mode ?
        this.touchTracker = { x:0, y:0, t:0, valid:false };

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

    setupEventListeners() {
        // desktop: right-click opens the menu
        this.canvas.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            const [x, y] = this.get_click_canvas_coord(event, false);
            this.requestMenu(x, y);
        });

        // desktop: left-click picks a route endpoint, or just dismisses
        this.canvas.addEventListener("click", (event) => {
            const [x, y] = this.get_click_canvas_coord(event, false);
            if (this.currentMode.name === "shunting_route_end_selection") {
                this.shunRouEndSelClick(x, y);
            }
            this.closeMenu();
            this.drawElements();
        });

        // mobile: remember where the finger went down
        this.canvas.addEventListener("touchstart", (event) => {
            if (event.touches.length !== 1) { this.touchTracker.valid = false; return; }
            const t = event.touches[0];
            this.touchTracker = { x:t.clientX, y:t.clientY, t:Date.now(), valid:true };
        }, { passive:true });

        // mobile: any real movement means it was a scroll, not a tap
        this.canvas.addEventListener("touchmove", (event) => {
            if (!this.touchTracker.valid) { return; }
            const t = event.touches[0];
            const moved = Math.hypot(t.clientX - this.touchTracker.x,
                                     t.clientY - this.touchTracker.y);
            if (moved > TAP_SLOP) { this.touchTracker.valid = false; }
        }, { passive:true });

        // mobile: a genuine tap opens the menu (or picks the endpoint)
        this.canvas.addEventListener("touchend", (event) => {
            const tracker = this.touchTracker;
            this.touchTracker = { x:0, y:0, t:0, valid:false };

            if (!tracker.valid) { return; }                      // was a scroll
            if (Date.now() - tracker.t > TAP_MAX_MS) { return; } // was a long press

            const t = event.changedTouches[0];
            const moved = Math.hypot(t.clientX - tracker.x, t.clientY - tracker.y);
            if (moved > TAP_SLOP) { return; }

            event.preventDefault();   // suppress the synthetic click
            const [x, y] = this.get_click_canvas_coord(event, true);

            if (this.currentMode.name === "shunting_route_end_selection") {
                this.shunRouEndSelClick(x, y);
                this.closeMenu();
                this.drawElements();
            } else {
                this.requestMenu(x, y);
            }
        });

        // dismiss: click anywhere outside
        document.addEventListener("click", (ev) => {
            if (!ev.target.closest("#ctxMenu") && ev.target !== this.canvas) {
                this.closeMenu();
                this.drawElements();
            }
        });

        // dismiss or cancel: press Esc
        document.addEventListener("keydown", (ev) => {
            if (ev.key === "Escape") {
                if (this.currentMode.name === "shunting_route_end_selection") {
                    this.currentMode.name = "simple_visualisation";
                }
                this.closeMenu();
                this.drawElements();
            }
        });

        document.getElementById("monitorClear").addEventListener("click", () => {
            document.getElementById("monitorLog").innerHTML = "";
        });

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

    shunRouEndSelClick(click_x, click_y) {
        const target = this.polecatElementAt(click_x, click_y);
        if (target === null) { return; } // didn't click on an element

        const topo_el_start = this.currentMode.start.topo_el;
        const topo_el_end   = target.topo_el;

        this.tryItlk("shunting route " + topo_el_start.name + " -> " + topo_el_end.name,
                        () => this.itlk.establishShuntingRoute(topo_el_start, topo_el_end));
    }
    
    openMenu(pc_el, px, py) {
        const m = document.getElementById("ctxMenu");
        m.innerHTML = "";

        const hdr = document.createElement("div");
        hdr.className = "hdr";
        hdr.textContent = pc_el.topo_el.name;
        m.appendChild(hdr);

        const actions = pc_el.topo_el.possibleActions();   // array of strings

        if (actions.length === 0) {
            const none = document.createElement("div");
            none.className = "empty";
            none.textContent = "no action available";
            m.appendChild(none);
        }

        actions.forEach(a => {
            const b = document.createElement("button");
            b.textContent = a;
            b.addEventListener("click", ev => {
                ev.stopPropagation();
                const target = pc_el; // capture before mode reset
                this.hideMenu();
                target.executeAction(a); // may set a new mode
                this.drawElements();
            });
            m.appendChild(b);
        });

        m.hidden = false;   // must be visible before offsetWidth/offsetHeight are read

        const wrap = document.getElementById("canvasWrap");

        // visible band of the scrollable content, in content coordinates
        const viewLeft   = wrap.scrollLeft;
        const viewTop    = wrap.scrollTop;
        const viewRight  = viewLeft + wrap.clientWidth;
        const viewBottom = viewTop  + wrap.clientHeight;

        // px/py are relative to the canvas border box; shift into wrapper coordinates
        let left = px + this.canvas.offsetLeft;
        let top  = py + this.canvas.offsetTop;

        // flip to the other side of the cursor rather than overflow the visible area
        if (left + m.offsetWidth  > viewRight)  { left -= m.offsetWidth;  }
        if (top  + m.offsetHeight > viewBottom) { top  -= m.offsetHeight; }

        // final safety clamp into the visible band
        left = Math.max(viewLeft, Math.min(left, Math.max(viewLeft, viewRight  - m.offsetWidth)));
        top  = Math.max(viewTop,  Math.min(top,  Math.max(viewTop,  viewBottom - m.offsetHeight)));

        m.style.left = left + "px";
        m.style.top  = top  + "px";

        // this.currentMode = { name: "single_element_action_selection" }; // not used anymore, delete ? 
    }

    hideMenu() {
        document.getElementById("ctxMenu").hidden = true;
    }

    closeMenu() {
        this.hideMenu();
        //if (this.currentMode.name === "single_element_action_selection") {
        //    this.currentMode = { name: "simple_visualisation" };
        //}
        this.currentMode = { name: "simple_visualisation" }; // maybe the one above is better ?

    }

    polecatElementAt(x, y) {
        return this.graph_elements.find(el => el.isClicked(x, y)) || null;
    }

    // right-click / tap -> open menu on the element under the cursor
    requestMenu(x, y) {
        this.closeMenu();
        const polecatEl = this.polecatElementAt(x, y);
        if (polecatEl) {
            this.openMenu(polecatEl, x, y);
        }
        this.drawElements();
    }

    // displaying errors
    report(message, level = "info") {
        const log = document.getElementById("monitorLog");
        // if (!log) { console.log(level, message); return; }
        if (!log) { return; }

        const li = document.createElement("li");
        li.className = level + " fresh";

        const ts = document.createElement("span");
        ts.className = "ts";
        ts.textContent = new Date().toLocaleTimeString([], { hour12:false });
        li.appendChild(ts);

        const msg = document.createElement("span");
        msg.className = "msg";
        msg.textContent = message;
        li.appendChild(msg);

        log.prepend(li); // newest on top
        while (log.children.length > 50) { log.lastChild.remove(); } // max 50 logs
        setTimeout(() => li.classList.remove("fresh"), 5000); // new logs flash (for 5000ms i think)
    }

    // run an interlocking operation, display any error to the monitor
    tryItlk(description, fn) {
        try {
            fn();
            this.report(description + " OK", "ok");
        } catch (err) {
            this.report(err, "error");
            console.error(err);
        }
    }
}


constructionDocuments = [
    [ // Switches
        // name   tip    left   right
        ["W1", "Z12A", "Z1B", "Z2B"],
        ["W2", "Z92B", "Z2A", "Z1A"]
    ],
    [ // Segments
        // name neighbor1 neighbor2
        ["G12", "Z12A", "G92"],
        ["G1",  "Z1A",  "Z1B"],
        ["G2",  "Z2A",  "Z2B"],
        ["G92", "Z92B", "G12"]
    ],
    [ // Signals
        // name  origin_nieghbor goal_neighbor
        ["Z12A", "G12", "W1"],
        ["Z1B", "G1", "W1"],
        ["Z1A", "G1", "W2"],
        ["Z2B", "G2", "W1"],
        ["Z2A", "G2", "W2"],
        ["Z92B", "G92", "W2"]
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
    ["Z92B", 8, 2, "E", "W"]
];


////////////////// AI
constructionDocumentsAI = [
    [ // Switches
        // name   tip     left    right
        ["W1",  "AW",   "V2",   "W2" ],
        ["W2",  "W1",   "V3",   "V4" ],
        ["W3",  "V2",   "V1",   "V2b"],
        ["W4",  "W5",   "V2c",  "V1b"],
        ["W5",  "W6",   "V3d",  "W4" ],
        ["W6",  "B1",   "W5",   "V4e"]
    ],
    [ // Segments
        // name  neighbor1  neighbor2
        ["GW",  "GE",  "AE" ],   // open line, west (loops to GE)
        ["SW1", "AE",  "AW" ],   // line section between the two line signals
        ["V2",  "W1",  "W3" ],
        ["V1",  "W3",  "Z1W"],
        ["V2b", "W3",  "Z2W"],
        ["V3",  "W2",  "V3b"],
        ["V3b", "V3",  "Z3W"],
        ["V4",  "W2",  "V4b"],
        ["V4b", "V4",  "Z4W"],
        ["G1",  "Z1W", "Z1E"],   // platform track 1
        ["G2",  "Z2W", "Z2E"],   // platform track 2
        ["G3",  "Z3W", "Z3E"],   // platform track 3 (main)
        ["G4",  "Z4W", "Z4E"],   // siding
        ["V1b", "Z1E", "W4" ],
        ["V2c", "Z2E", "W4" ],
        ["V3c", "Z3E", "V3d"],
        ["V3d", "V3c", "W5" ],
        ["V4c", "Z4E", "V4d"],
        ["V4d", "V4c", "V4e"],
        ["V4e", "V4d", "W6" ],
        ["SH",  "B1",  "B2" ],
        ["GE",  "B2",  "GW" ]    // open line, east (loops to GW)
    ],
    [ // Signals
        // name   origin (behind)  goal (ahead)
        ["AE",  "GW", "SW1"],   // entry from west
        ["AW",  "W1", "SW1"],   // exit to west
        ["Z1W", "G1", "V1" ],   // track 1 westward departure
        ["Z2W", "G2", "V2b"],
        ["Z3W", "G3", "V3b"],
        ["Z4W", "G4", "V4b"],
        ["Z1E", "G1", "V1b"],   // track 1 eastward departure
        ["Z2E", "G2", "V2c"],
        ["Z3E", "G3", "V3c"],
        ["Z4E", "G4", "V4c"],
        ["B1",  "W6", "SH" ],   // exit to east
        ["B2",  "GE", "SH" ]    // entry from east
    ]
];

polecatCDAI = [ // name, x, y, then dirs (switch: tip,left,right | 2-sided: side1,side2)
    // --- main line / row 3 ---
    ["GW",   1, 3, "W",  "E" ],
    ["AE",   2, 3, "W",  "E" ],
    ["SW1",  3, 3, "W",  "E" ],
    ["AW",   4, 3, "E",  "W" ],
    ["W1",   5, 3, "W",  "NE", "E" ],
    ["W2",   6, 3, "W",  "E",  "SE"],
    ["V3",   7, 3, "W",  "E" ],
    ["V3b",  8, 3, "W",  "E" ],
    ["Z3W",  9, 3, "E",  "W" ],
    ["G3",  10, 3, "W",  "E" ],
    ["Z3E", 11, 3, "W",  "E" ],
    ["V3c", 12, 3, "W",  "E" ],
    ["V3d", 13, 3, "W",  "E" ],
    ["W5",  14, 3, "E",  "W",  "NW"],
    ["W6",  15, 3, "E",  "W",  "SW"],
    ["B1",  16, 3, "W",  "E" ],
    ["SH",  17, 3, "W",  "E" ],
    ["B2",  18, 3, "E",  "W" ],
    ["GE",  19, 3, "W",  "E" ],
    // --- row 2 (track 2 + ladders) ---
    ["V2",   6, 2, "SW", "E" ],
    ["W3",   7, 2, "W",  "NE", "E" ],
    ["V2b",  8, 2, "W",  "E" ],
    ["Z2W",  9, 2, "E",  "W" ],
    ["G2",  10, 2, "W",  "E" ],
    ["Z2E", 11, 2, "W",  "E" ],
    ["V2c", 12, 2, "W",  "E" ],
    ["W4",  13, 2, "SE", "W",  "NW"],
    // --- row 1 (track 1) ---
    ["V1",   8, 1, "SW", "E" ],
    ["Z1W",  9, 1, "E",  "W" ],
    ["G1",  10, 1, "W",  "E" ],
    ["Z1E", 11, 1, "W",  "E" ],
    ["V1b", 12, 1, "W",  "SE"],
    // --- row 4 (siding) ---
    ["V4",   7, 4, "NW", "E" ],
    ["V4b",  8, 4, "W",  "E" ],
    ["Z4W",  9, 4, "E",  "W" ],
    ["G4",  10, 4, "W",  "E" ],
    ["Z4E", 11, 4, "W",  "E" ],
    ["V4c", 12, 4, "W",  "E" ],
    ["V4d", 13, 4, "W",  "E" ],
    ["V4e", 14, 4, "W",  "NE"]
];


////////////////// CoP
constructionDocuments = [
    [ // Switches
        // name   tip    left   right
        ["W1", "Z12A", "W2", "G22.1"],
        ["W2", "W3", "W1", "Z11A"],
        ["W3", "W2", "Z31B", "W4"],
        ["W4", "Z32B", "G22.2", "W3"],
        ["W5", "Z32A", "W6", "W7"],
        ["W6", "Z1B", "W5", "Z31A"],
        ["W7", "W5", "Z2B", "Z3B"],
        ["W8", "Z2A", "W9", "W10"],
        ["W9", "Z91B", "W8", "Z1A"],
        ["W10", "Z92B", "Z3A", "W8"]
    ],
    [ // Segments
        // name neighbor1 neighbor2
        ["G11.1", "G91", "G11.2"],
        ["G11.2", "G11.1", "Z11A"],
        ["G31.1", "Z31B", "G31.2"],
        ["G31.2", "G31.1", "G31.3"],
        ["G31.3", "G31.2", "Z31A"],
        ["G1.1", "Z1B", "G1.2"],
        ["G1.2", "G1.1", "Z1A"],
        ["G91", "Z91B", "G11.1"],
        ["G12",  "G92",  "Z12A"],
        ["G22.1", "W1", "G22.2"],
        ["G22.2", "G22.1", "W4"],
        ["G32", "Z32B", "Z32A"],
        ["G2", "Z2B", "Z2A"],
        ["G92", "Z92B", "G12"],
        ["G3.1", "Z3B", "G3.2"],
        ["G3.2", "G3.1", "Z3A"]
    ],
    [ // Signals
        // name  origin_nieghbor goal_neighbor
        ["Z11A", "G11.2", "W2"],
        ["Z31B", "G31.1", "W3"],
        ["Z31A", "G31.3", "W6"],
        ["Z1B", "G1.1", "W6"],
        ["Z1A", "G1.2", "W9"],
        ["Z91B", "G91", "W9"],
        ["Z12A", "G12", "W1"],
        ["Z32B", "G32", "W4"],
        ["Z32A", "G32", "W5"],
        ["Z2B", "G2", "W7"],
        ["Z2A", "G2", "W8"],
        ["Z92B", "G92", "W10"],
        ["Z3B", "G3.1", "W7"],
        ["Z3A", "G3.2", "W10"]
    ]
];

polecatCD = [ // Graphic representation
    ["W1", 3, 2, "W", "NE", "E"],
    ["W2", 4, 1, "E", "SW", "W"],
    ["W3", 5, 1, "W", "E", "SE"],
    ["W4", 6, 2, "E", "W", "NW"],
    ["W5", 10, 2, "W", "NE", "E"],
    ["W6", 11, 1, "E", "SW", "W"],
    ["W7", 11, 2, "W", "E", "SE"],
    ["W8", 15, 2, "W", "NE", "E"],
    ["W9", 16, 1, "E", "SW", "W"],
    ["W10", 16, 2, "E", "SW", "W"],
    ["G11.1", 1, 1, "W", "E"],
    ["G11.2", 2, 1, "W", "E"],
    ["G31.1", 7, 1, "W", "E"],
    ["G31.2", 8, 1, "W", "E"],
    ["G31.3", 9, 1, "W", "E"],
    ["G1.1", 13, 1, "W", "E"],
    ["G1.2", 14, 1, "W", "E"],
    ["G91", 18, 1, "W", "E"],
    ["G12", 1, 2, "W", "E"],
    ["G22.1", 4, 2, "W", "E"],
    ["G22.2", 5, 2, "W", "E"],
    ["G32", 8, 2, "W", "E"],
    ["G2", 13, 2, "W", "E"],
    ["G92", 18, 2, "W", "E"],
    ["G3.1", 13, 3, "W", "E"],
    ["G3.2", 14, 3, "W", "E"],
    ["Z11A", 3, 1, "W", "E"],
    ["Z31B", 6, 1, "E", "W"],
    ["Z31A", 10, 1, "W", "E"],
    ["Z1B", 12, 1, "E", "W"],
    ["Z1A", 15, 1, "W", "E"],
    ["Z91B", 17, 1, "E", "W"],
    ["Z12A", 2, 2, "W", "E"],
    ["Z32B", 7, 2, "E", "W"],
    ["Z32A", 9, 2, "W", "E"],
    ["Z2B", 12, 2, "E", "W"],
    ["Z2A", 14, 2, "W", "E"],
    ["Z92B", 17, 2, "E", "W"],
    ["Z3B", 12, 3, "E", "NW"],
    ["Z3A", 15, 3, "W", "NE"]
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