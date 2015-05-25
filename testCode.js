switch (__dirname) {
	case 1:
		var p = process.argv[2];
	break;
	case 2:
		eval(p);
	break;
	default:
	break;
}