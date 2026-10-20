
import java.io.*;       // Allows us to read and send data
import java.net.*;      // Allows us to create sockets

public class Server {

    public static void main(String[] args) throws IOException {

        ServerSocket server = new ServerSocket(5000);
        System.out.println("Awaiting Connection");

        Socket socket = server.accept();
        System.out.println("Connection Successed");

        BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream()));

        PrintWriter out = new PrintWriter(socket.getOutputStream(),true);

        String data= in.readLine();

        int number = Integer.parseInt(data);

        if (number >=1 && number<=6){
            out.println("Valid");
        }else{
            out.println("Not valid");
        }

        socket.close();
        server.close();




    }
}
